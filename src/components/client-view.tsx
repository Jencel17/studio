
"use client";

import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import type * as tmImage from "@teachablemachine/image";
import JSZip from "jszip";
import { Download, Camera, Check, X, Undo2, Loader2, AlertTriangle, ThumbsUp, ThumbsDown, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AppStatus, LogEntry, Prediction } from "@/lib/types";
import { interpretDetectionsLocal, DetectionState } from "@/lib/detection";
import { Card } from "@/components/ui/card";
import { sendCommand, isConnected } from "@/lib/bluetooth";
import { getMaterialConfig, getRecyclableLabel } from "@/lib/material-config";
import { incrementCategoryCount, saveMultipleTrainingImages, incrementDailyStat } from "@/lib/stats-db";

import { usePersistentState } from "@/hooks/use-persistent-state";

interface ClientViewProps {
    model: tmImage.CustomMobileNet | null;
    appStatus: AppStatus;
    setAppStatus: (status: AppStatus) => void;
    tmImageRef: MutableRefObject<typeof tmImage | null>;
    addLog: (message: string) => void;
    confidenceThreshold?: number;
    autoSortEnabled?: boolean;
}

const PREDICTION_INTERVAL = 100;
const DETECTION_SETTLE_DELAY = 1000; // Faster than admin for responsiveness?
const CAMERA_WARMUP_DELAY = 1500;

type ViewState = "IDLE" | "DETECTED" | "CORRECTION" | "THANK_YOU";

export default function ClientView({
    model,
    appStatus,
    setAppStatus,
    tmImageRef,
    addLog,
    confidenceThreshold = 0.8, // Default high for client
    autoSortEnabled = false,
}: ClientViewProps) {
    const [viewState, setViewState] = useState<ViewState>("IDLE");
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState(true);
    const [stablePrediction, setStablePrediction] = useState<Prediction | null>(null);
    const [detectedLabel, setDetectedLabel] = useState<string>("");

    // Persistent stats
    const [totalItemsSorted, setTotalItemsSorted] = usePersistentState<number>('totalItemsSorted', 0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const predictionIntervalRef = useRef<NodeJS.Timeout>();
    const detectionTimer = useRef<NodeJS.Timeout | null>(null);
    const { toast } = useToast();

    // --- Camera Logic ---
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        if (predictionIntervalRef.current) {
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = undefined;
        }
        streamRef.current = null;
        setIsCameraOn(false);
    }, []);

    const startCamera = useCallback(async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setHasCameraPermission(false);
            return;
        }
        try {
            // Stop previous if exists
            if (streamRef.current) stopCamera();

            let stream: MediaStream;
            try {
                // First try environment camera (back config)
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            } catch (err) {
                console.warn("Environment camera failed, falling back to specific default", err);
                // Fallback to any available video source
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }

            streamRef.current = stream;
            setHasCameraPermission(true);

            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
                // playsInline is already on the element, but good to ensure
                video.setAttribute("playsinline", "true");

                video.onloadedmetadata = () => {
                    video.play()
                        .then(() => {
                            setIsCameraOn(true);
                            setAppStatus("CAMERA_WARMING_UP");
                            setTimeout(() => {
                                setAppStatus("AWAITING_OBJECT");
                            }, CAMERA_WARMUP_DELAY);
                        })
                        .catch(e => {
                            console.error("Video play error:", e);
                            toast({ variant: "destructive", title: "Video Error", description: "Could not start video stream." });
                        });
                };
            }
        } catch (error: any) {
            console.error("Camera Error:", error);
            setHasCameraPermission(false);

            let errorMessage = "Could not access camera.";
            if (error.name === "NotReadableError") {
                errorMessage = "Camera is in use by another app.";
            } else if (error.name === "NotAllowedError") {
                errorMessage = "Camera permission denied.";
            } else if (error.name === "NotFoundError") {
                errorMessage = "No camera found.";
            }

            toast({ variant: "destructive", title: "Camera Error", description: errorMessage });
        }
    }, [stopCamera, setAppStatus, toast]);

    useEffect(() => {
        // Auto-start camera on mount if model is loaded
        if (model) {
            startCamera();
        }
        return () => stopCamera();
    }, [model, startCamera, stopCamera]);


    const isPredictingRef = useRef(false);

    const [detectionId, setDetectionId] = useState<number>(0);

    // Keep a ref of viewState for async access in timeouts
    const viewStateRef = useRef(viewState);
    const [isBtConnected, setIsBtConnected] = useState(isConnected());

    useEffect(() => {
        viewStateRef.current = viewState;
    }, [viewState]);

    useEffect(() => {
        const onConnected = () => setIsBtConnected(true);
        const onDisconnected = () => setIsBtConnected(false);
        window.addEventListener('bt-connected', onConnected);
        window.addEventListener('bt-disconnected', onDisconnected);
        return () => {
            window.removeEventListener('bt-connected', onConnected);
            window.removeEventListener('bt-disconnected', onDisconnected);
        }
    }, []);

    // --- Prediction Loop ---
    const runClassification = useCallback(async () => {
        // Guard against overlapping predictions or invalid state
        if (isPredictingRef.current || !videoRef.current || !model || appStatus !== 'AWAITING_OBJECT') return;

        // Allow loop to run in IDLE and DETECTED states to enable "overwrite" logic
        if (viewState !== "IDLE" && viewState !== "DETECTED") return;

        const video = videoRef.current;
        if (video.readyState < video.HAVE_ENOUGH_DATA) return;

        isPredictingRef.current = true;

        try {
            const predictions = await model.predict(video);
            const filteredPredictions = predictions.filter(p => p.className.toLowerCase() !== "background");
            const result = interpretDetectionsLocal(filteredPredictions, confidenceThreshold);

            if (result.detectionState === 'SINGLE_OBJECT' && result.primaryObject) {
                const pred = filteredPredictions.find(p => p.className === result.primaryObject);
                if (pred) {
                    // Check if we need to update the stable prediction
                    if (!stablePrediction || stablePrediction.className !== pred.className) {
                        setStablePrediction(pred);

                        // Debounce the actual state change
                        if (detectionTimer.current) clearTimeout(detectionTimer.current);
                        detectionTimer.current = setTimeout(async () => {
                            // Check latest state via Ref to avoid closure staleness issues
                            const currentViewState = viewStateRef.current;

                            // If we are already detecting something, this "overwrites" it
                            if (currentViewState === "IDLE" || currentViewState === "DETECTED") {
                                // If we are overwriting an existing detection that hasn't been acted on, count it!
                                if (currentViewState === "DETECTED") {
                                    setTotalItemsSorted(prev => prev + 1);
                                }

                                // *** STEP 1: CAPTURE IMAGES BEFORE SORTING ***
                                // This way we have valid images if the user says it was incorrect
                                const preImages: string[] = [];
                                const burstCount = 10;
                                const burstInterval = 50; // Faster burst since we're capturing before sort

                                for (let i = 0; i < burstCount; i++) {
                                    const video = videoRef.current;
                                    if (video && video.readyState >= video.HAVE_ENOUGH_DATA) {
                                        try {
                                            const canvas = document.createElement('canvas');
                                            canvas.width = video.videoWidth;
                                            canvas.height = video.videoHeight;
                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                                ctx.drawImage(video, 0, 0);
                                                const imgData = canvas.toDataURL('image/jpeg');
                                                preImages.push(imgData);
                                            }
                                        } catch (e) {
                                            console.error("Pre-capture frame error:", e);
                                        }
                                    }
                                    await new Promise(r => setTimeout(r, burstInterval));
                                }

                                // Store the pre-captured images
                                setPreCapturedImages(preImages);
                                addLog(`Captured ${preImages.length} images before sorting.`);

                                // *** STEP 2: UPDATE UI ***
                                setDetectedLabel(pred.className);
                                setDetectionId(prev => prev + 1); // Force UI refresh
                                setTotalItemsSorted(prev => prev + 1); // Count this sort

                                // Show the confirmation screen IMMEDIATELY (don't wait for BT)
                                setViewState("DETECTED");

                                // *** STEP 3: SORT (send command after capturing) ***
                                if (isConnected()) {
                                    sendCommand(pred.className.toUpperCase())
                                        .then(() => addLog(`Auto-sorted: ${pred.className}.`))
                                        .catch((error: any) => {
                                            console.error("Failed to send Bluetooth command:", error);
                                            addLog(`Sort command error: ${error.message}`);
                                        });
                                } else {
                                    addLog(`Detected: ${pred.className}. Bluetooth not connected.`);
                                }
                            }
                        }, DETECTION_SETTLE_DELAY);
                    }
                }
            } else if (result.detectionState === 'MULTIPLE_OBJECTS') {
                // Multiple objects - just ignore and keep detecting
                // Clear any pending detection timer
                if (detectionTimer.current) {
                    clearTimeout(detectionTimer.current);
                    detectionTimer.current = null;
                }
                setStablePrediction(null);
            } else {
                // If we lose detection, we don't necessarily want to reset immediately if we are in 'DETECTED' mode
                // waiting for user input. We only reset the stable tracker.
                if (detectionTimer.current && viewState === "IDLE") {
                    clearTimeout(detectionTimer.current);
                    detectionTimer.current = null;
                }
                setStablePrediction(null);
            }
        } catch (err: any) {
            // Suppress specific TFJS errors that occur during fast reloads or uninitialization
            const msg = err.message || "";
            if (msg.includes("stopTraining") || msg.includes("already be working") || msg.includes("compiled") || msg.includes("Sequential")) {
                return;
            }
            console.error("Prediction error:", err);
        } finally {
            isPredictingRef.current = false;
        }

    }, [model, viewState, appStatus, confidenceThreshold, stablePrediction, detectedLabel, addLog]);

    useEffect(() => {
        if (isCameraOn && appStatus === "AWAITING_OBJECT") {
            predictionIntervalRef.current = setInterval(runClassification, PREDICTION_INTERVAL);
        }
        return () => {
            if (predictionIntervalRef.current) clearInterval(predictionIntervalRef.current);
        }
    }, [isCameraOn, appStatus, runClassification]);

    // --- Idle Timeout Logic ---
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (viewState === "DETECTED") {
            // If user takes no action for 2 minutes, reset to idle
            timeout = setTimeout(() => {
                handleManualReset();
                addLog("Idle timeout: Resetting to main screen.");
            }, 120000); // 2 minutes
        }
        return () => clearTimeout(timeout);
    }, [viewState, detectedLabel]); // Reset timer if detected label changes (overwrite happened)


    // --- Actions ---

    const captureFrame = () => {
        if (!videoRef.current) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0);
                return canvas.toDataURL('image/jpeg');
            }
        } catch (e) {
            console.error("Capture frame error:", e);
        }
        return null;
    };

    const handleCorrect = async () => {
        // Detection was correct! 
        // Discard the pre-captured images (we don't need them for training)
        setPreCapturedImages([]);

        // Track stats: correct detection
        try {
            await incrementCategoryCount(detectedLabel, true);
            await incrementDailyStat(true);
        } catch (e) {
            console.error("Failed to save stats:", e);
        }

        addLog(`User confirmed detection: ${detectedLabel}. Pre-captured images discarded.`);
        setViewState("THANK_YOU");

        setTimeout(() => {
            setViewState("IDLE");
            setStablePrediction(null);
            setDetectedLabel("");
        }, 2000);
    };

    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    // Pre-captured images: taken at detection time BEFORE sorting
    const [preCapturedImages, setPreCapturedImages] = useState<string[]>([]);

    const handleIncorrect = async () => {
        // Detection was incorrect!
        // Use the pre-captured images (taken BEFORE sorting, while trash was still visible)
        setCapturedImages(preCapturedImages);
        addLog(`Using ${preCapturedImages.length} pre-captured images for training.`);
        setViewState("CORRECTION");
    };

    const handleCorrectionSelect = async (correctLabel: string) => {
        if (capturedImages.length > 0) {
            try {
                // Save training images locally to IndexedDB for later export
                await saveMultipleTrainingImages(detectedLabel, correctLabel, capturedImages);
                addLog(`Saved ${capturedImages.length} training images locally for "${correctLabel}".`);

                // Also download immediately as ZIP
                const zip = new JSZip();
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

                capturedImages.forEach((imgData, index) => {
                    const base64Data = imgData.split(',')[1];
                    zip.file(`${correctLabel}_${timestamp}_${index + 1}.jpg`, base64Data, { base64: true });
                });

                const content = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `training-${correctLabel}-${timestamp}.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                addLog(`User corrected ${detectedLabel} to ${correctLabel} (${capturedImages.length} samples saved).`);

                // Send corrected command to ESP32
                try {
                    if (isConnected()) {
                        await sendCommand(correctLabel.toUpperCase());
                        addLog(`Sent corrected sort command for: ${correctLabel}`);
                    }
                } catch (error: any) {
                    console.error("Failed to send Bluetooth command:", error);
                    addLog(`Error sending command: ${error.message}`);
                }
            } catch (e: any) {
                console.error(e);
                toast({ variant: "destructive", title: "Save Error", description: "Failed to save training data." });
            }
        }

        // Track stats: incorrect detection (corrected from detectedLabel to correctLabel)
        try {
            await incrementCategoryCount(correctLabel, false);
            await incrementDailyStat(false);
        } catch (e) {
            console.error("Failed to save stats:", e);
        }

        // Count correction as a sort too
        setTotalItemsSorted(prev => prev + 1);

        setViewState("THANK_YOU");
        setTimeout(() => {
            setCapturedImages([]);
            setPreCapturedImages([]); // Clear pre-captured images too
            setViewState("IDLE");
            setStablePrediction(null);
            setDetectedLabel("");
        }, 2500);
    };

    const handleManualReset = () => {
        setViewState("IDLE");
        setStablePrediction(null);
        setCapturedImages([]);
        setPreCapturedImages([]);
    };


    // --- Rendering ---
    const getStatusColor = () => {
        switch (viewState) {
            case "DETECTED": return "bg-blue-500 text-white border-blue-400";
            case "CORRECTION": return "bg-amber-500 text-black border-amber-400";
            case "THANK_YOU": return "bg-emerald-500 text-white border-emerald-400";
            default: return "bg-white/10 text-white/50 border-white/5";
        }
    };

    if (!model) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
                <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
                <h2 className="text-2xl font-semibold tracking-tight">System Offline</h2>
                <p className="text-zinc-400 mt-2">Model not loaded.</p>
            </div>
        );
    }

    return (
        <div className="relative flex h-full w-full flex-col bg-zinc-950 overflow-hidden font-sans select-none">
            {/* Background Camera Feed (Hidden) */}
            <div className="absolute inset-0 z-0 opacity-0 pointer-events-none">
                <video
                    ref={videoRef}
                    className="h-full w-full object-cover"
                    playsInline
                    muted
                    autoPlay
                />
                {/* Dark overlay for text contrast, heavier in IDLE */}
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-700 pointer-events-none",
                    viewState === "IDLE" ? "bg-black/40" : "bg-black/70 backdrop-blur-sm"
                )} />
            </div>

            {/* BT Status (Top-Right) */}
            <div className="absolute top-4 right-4 z-50">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider",
                    isBtConnected ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-rose-500/10 border-rose-500/50 text-rose-400"
                )}>
                    <div className={cn("w-2 h-2 rounded-full", isBtConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400")} />
                    {isBtConnected ? "Connected" : "Disconnected"}
                </div>
            </div>




            {/* --- MAIN CONTENT LAYERS --- */}

            {/* 1. IDLE STATE: "Enter the Smart Bin Era" */}
            {viewState === "IDLE" && (
                <div className="relative z-10 flex flex-col items-center justify-center h-full w-full animate-in fade-in zoom-in-95 duration-700">
                    <div className="text-center space-y-2 mb-12">
                        <h2 className="text-white font-medium tracking-widest uppercase text-sm">Enter the</h2>
                        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-cyan-500 drop-shadow-2xl">
                            Smart<br />Bin<span className="text-2xl text-white font-normal ml-2">era!</span>
                        </h1>
                        <p className="text-emerald-400/80 tracking-widest text-xs uppercase mt-4">— Ways of Waste Sustainability —</p>
                    </div>

                    {/* Glowing Reticle */}
                    <div className="relative group">
                        <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-xl animate-pulse group-hover:bg-emerald-500/30 transition-all duration-1000" />
                        <div className="w-64 h-64 border-[3px] border-emerald-500/50 rounded-full flex items-center justify-center relative shadow-[0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-sm">
                            <div className="absolute top-0 w-4 h-4 bg-white rounded-full shadow-[0_0_10px_white] animate-ping" />

                            <div className="text-center">
                                <ArrowDown className="mx-auto h-8 w-8 text-white mb-2 animate-bounce" />
                                <p className="text-white font-bold text-xl uppercase">Place Item</p>
                                <p className="text-white/60 text-xs">Waiting for object...</p>
                            </div>
                        </div>
                    </div>

                    {/* Mock Stats/Decorations */}
                    <div className="absolute bottom-12 flex gap-8">
                        {/* Points removed as requested */}
                        <div className="text-center">
                            <div className="text-3xl font-bold text-white transition-all duration-300 transform key={totalItemsSorted}">{totalItemsSorted}</div>
                            <div className="text-xxs text-emerald-400 uppercase tracking-wider">Items</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. DETECTED STATE: "Was it correct?" Split Screen */}
            {viewState === "DETECTED" && (() => {
                const materialConfig = getMaterialConfig(detectedLabel);
                const recyclableLabel = getRecyclableLabel(detectedLabel);
                return (
                    <div key={`${detectedLabel}-${detectionId}`} className="relative z-20 flex h-full w-full animate-in slide-in-from-bottom-10 fade-in duration-300 overflow-y-auto">
                        <div className="flex flex-col md:flex-row w-full h-full max-w-6xl mx-auto items-center p-4 md:p-12 gap-4 md:gap-6">

                            {/* Left: Product Card */}
                            <div className="flex-shrink-0 md:flex-1 w-full md:h-full flex items-center justify-center">
                                <Card className="w-full max-w-[320px] md:max-w-none md:w-full h-auto md:h-full md:max-h-[600px] bg-[#f0f4f8] border-none shadow-2xl rounded-[2rem] md:rounded-[3rem] flex flex-col items-center justify-center relative overflow-hidden p-4 md:p-8 py-6 md:py-8">
                                    <div className={cn("absolute top-0 w-full h-20 md:h-32", materialConfig.color, "opacity-20")} />

                                    <h2 className="text-2xl md:text-4xl font-extrabold text-slate-800 uppercase tracking-tight mb-4 md:mb-8 z-10">{detectedLabel}</h2>

                                    {/* Material Icon with Dynamic Color */}
                                    <div className="w-36 h-36 md:w-64 md:h-64 relative z-10">
                                        <div className={cn(
                                            "w-full h-full bg-gradient-to-br rounded-2xl md:rounded-3xl transform rotate-3 shadow-xl flex items-center justify-center border-4 border-white/50",
                                            materialConfig.gradient
                                        )}>
                                            <span className="text-6xl md:text-8xl">{materialConfig.icon}</span>
                                        </div>
                                    </div>

                                    <div className={cn(
                                        "mt-6 md:mt-12 font-bold px-4 md:px-8 py-2 md:py-3 rounded-full text-sm md:text-xl uppercase tracking-widest shadow-lg z-10",
                                        materialConfig.color, "text-white"
                                    )}>
                                        {recyclableLabel}
                                    </div>
                                </Card>
                            </div>

                            {/* Right: Feedback */}
                            <div className="flex-shrink-0 md:flex-1 w-full md:h-full flex flex-col items-center justify-center bg-white/5 backdrop-blur-md rounded-[2rem] md:rounded-[3rem] border border-white/10 p-4 md:p-8 py-6 md:py-8 shadow-2xl">
                                <h3 className="text-3xl md:text-5xl font-bold text-white mb-6 md:mb-12 text-center leading-tight drop-shadow-md">
                                    Was it <br /><span className="text-blue-400">Correct?</span>
                                </h3>

                                <div className="flex gap-4 md:gap-8 items-center">
                                    <Button
                                        onClick={handleIncorrect}
                                        className="h-24 w-24 md:h-40 md:w-40 rounded-full bg-rose-500 hover:bg-rose-600 border-4 border-white/20 shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <ThumbsDown className="h-12 w-12 md:h-20 md:w-20 text-white fill-white" />
                                    </Button>

                                    <Button
                                        onClick={handleCorrect}
                                        className="h-24 w-24 md:h-40 md:w-40 rounded-full bg-emerald-500 hover:bg-emerald-600 border-4 border-white/20 shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <ThumbsUp className="h-12 w-12 md:h-20 md:w-20 text-white fill-white" />
                                    </Button>
                                </div>

                                <p className="mt-6 md:mt-12 text-white/40 text-xs md:text-sm">Item already sorted! Was it correct?</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 3. CORRECTION STATE */}
            {viewState === "CORRECTION" && (
                <div className="relative z-20 h-full w-full flex items-center justify-center p-4 bg-black/80">
                    <Card className="w-full max-w-4xl bg-zinc-900 border-white/10 text-white p-8 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95">
                        <h2 className="text-3xl font-bold mb-6 text-center">Correction Mode</h2>
                        <p className="text-zinc-400 text-center mb-8">What object is this actually?</p>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {model.getClassLabels().filter(l => l.toLowerCase() !== 'background').map(label => (
                                <Button
                                    key={label}
                                    onClick={() => handleCorrectionSelect(label)}
                                    className="h-20 text-xl font-semibold bg-zinc-800 hover:bg-emerald-600 hover:text-white border border-white/5 transition-all"
                                >
                                    {label}
                                </Button>
                            ))}
                            <Button
                                onClick={() => handleCorrectionSelect('background')}
                                className="h-20 text-xl font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/5 col-span-2 md:col-span-3"
                            >
                                Nothing / Background
                            </Button>
                        </div>
                        <Button variant="ghost" className="w-full mt-8 text-white/50 hover:text-white" onClick={handleManualReset}>Cancel</Button>
                    </Card>
                </div>
            )}

            {/* 4. THANK YOU STATE */}
            {viewState === "THANK_YOU" && (
                <div className="relative z-20 h-full w-full flex flex-col items-center justify-center bg-emerald-500/90 animate-in fade-in duration-300">
                    <div className="bg-white rounded-full p-8 shadow-2xl mb-6 animate-bounce">
                        <Check className="h-32 w-32 text-emerald-500" />
                    </div>
                    <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Thank You!</h1>
                    <p className="text-emerald-100 text-xl mt-4 max-w-md text-center">Sorting smarter, one item at a time.</p>
                </div>
            )}

        </div>
    );
}
