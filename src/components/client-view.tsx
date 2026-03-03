"use client";

import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import type * as tmImage from "@teachablemachine/image";
import JSZip from "jszip";
import { Download, Camera, Check, X, Undo2, Loader2, AlertTriangle, ThumbsUp, ThumbsDown, ArrowDown, Cpu, Leaf, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AppStatus, LogEntry, Prediction, ROI } from "@/lib/types";
import { interpretDetectionsLocal, DetectionState } from "@/lib/detection";
import { Card } from "@/components/ui/card";
import { sendCommand, isConnected, type ESP32Status } from "@/lib/bluetooth";
import { getMaterialConfig, getCategoryLabel } from "@/lib/material-config";
import { incrementCategoryCount, saveMultipleTrainingImages, incrementDailyStat, getSummaryStats } from "@/lib/stats-db";
import { updateLiveDetection, subscribeToStats, subscribeToManualSortCommand, ackManualSortCommand } from "@/lib/firestore-sync";

interface ClientViewProps {
    model: tmImage.CustomMobileNet | null;
    appStatus: AppStatus;
    setAppStatus: (status: AppStatus) => void;
    tmImageRef: MutableRefObject<typeof tmImage | null>;
    addLog: (message: string) => void;
    confidenceThreshold?: number;
    autoSortEnabled?: boolean;
    roi: ROI;
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
    roi,
}: ClientViewProps) {
    // --- 1. State & Refs ---
    const [viewState, setViewState] = useState<ViewState>("IDLE");
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState(true);
    const [stablePrediction, setStablePrediction] = useState<Prediction | null>(null);
    const [detectedLabel, setDetectedLabel] = useState<string>("");
    const [totalSorted, setTotalSorted] = useState<number>(0);
    const [detectionId, setDetectionId] = useState<number>(0);
    const [isBtConnected, setIsBtConnected] = useState(isConnected());
    const [alcoholStatus, setAlcoholStatus] = useState<string | null>(null);
    const [alcoholLevel, setAlcoholLevel] = useState<number>(0);
    const [sorterStatus, setSorterStatus] = useState<string>("READY");
    const [bioTrash, setBioTrash] = useState<number>(0);
    const [nonBioTrash, setNonBioTrash] = useState<number>(0);
    const [eWasteTrash, setEWasteTrash] = useState<number>(0);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const [preCapturedImages, setPreCapturedImages] = useState<string[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const predictionIntervalRef = useRef<NodeJS.Timeout>();
    const detectionTimer = useRef<NodeJS.Timeout | null>(null);
    const isPredictingRef = useRef(false);
    const viewStateRef = useRef(viewState);
    const lastLivePushRef = useRef<number>(0);
    const lastProcessedSortTimestamp = useRef<number>(0);

    const { toast } = useToast();

    // Update internal ref for async access
    useEffect(() => {
        viewStateRef.current = viewState;
    }, [viewState]);

    // --- 2. Shared Actions (Memoized) ---

    const getArduinoCommand = useCallback((label: string): string => {
        const l = label.toUpperCase();
        if (l === "PAPER") return "BIODEGRADABLE";
        if (l === "METAL") return "NON-BIODEGRADABLE";
        if (l === "PLASTIC") return "E-WASTE";
        return l;
    }, []);

    const handleManualReset = useCallback(() => {
        setViewState("IDLE");
        setStablePrediction(null);
        setCapturedImages([]);
        setPreCapturedImages([]);
    }, []);

    const captureFrame = useCallback(() => {
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
    }, []);

    const handleCorrect = useCallback(async () => {
        setPreCapturedImages([]);
        try {
            await incrementCategoryCount(detectedLabel, true);
            await incrementDailyStat(true);
        } catch (e) {
            console.error("Failed to save stats:", e);
        }
        addLog(`User confirmed detection: ${detectedLabel}. Pre-captured images discarded.`);
        setViewState("THANK_YOU");
        setAppStatus("THANK_YOU");
        setTimeout(() => {
            setAppStatus("AWAITING_OBJECT");
            setViewState("IDLE");
            setStablePrediction(null);
            setDetectedLabel("");
        }, 2000);
    }, [detectedLabel, addLog, setAppStatus]);

    const handleIncorrect = useCallback(async () => {
        setCapturedImages(preCapturedImages);
        addLog(`Using ${preCapturedImages.length} pre-captured images for training.`);
        setViewState("CORRECTION");
    }, [preCapturedImages, addLog]);

    const handleCorrectionSelect = useCallback(async (correctLabel: string) => {
        if (capturedImages.length > 0) {
            try {
                await saveMultipleTrainingImages(detectedLabel, correctLabel, capturedImages);
                addLog(`Saved ${capturedImages.length} training images locally for "${correctLabel}".`);
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
                if (isConnected()) {
                    await sendCommand(correctLabel.toUpperCase());
                    addLog(`Sent corrected sort command for: ${correctLabel}`);
                }
            } catch (e: any) {
                console.error(e);
                toast({ variant: "destructive", title: "Save Error", description: "Failed to save training data." });
            }
        }
        try {
            await incrementCategoryCount(correctLabel, false);
            await incrementDailyStat(false);
        } catch (e) {
            console.error("Failed to save stats:", e);
        }
        addLog("Correction recorded.");
        setViewState("THANK_YOU");
        setAppStatus("THANK_YOU");
        setTimeout(() => {
            setAppStatus("AWAITING_OBJECT");
            setCapturedImages([]);
            setPreCapturedImages([]);
            setViewState("IDLE");
            setStablePrediction(null);
            setDetectedLabel("");
        }, 2500);
    }, [capturedImages, detectedLabel, addLog, setAppStatus, toast]);

    const runClassification = useCallback(async () => {
        if (isPredictingRef.current || !videoRef.current || !model || appStatus !== 'AWAITING_OBJECT') return;
        if (viewState !== "IDLE" && viewState !== "DETECTED") return;
        const video = videoRef.current;
        if (video.readyState < video.HAVE_ENOUGH_DATA) return;
        isPredictingRef.current = true;
        try {
            // Prepare cropped canvas if ROI is enabled
            let input: HTMLVideoElement | HTMLCanvasElement = video;
            if (roi.enabled) {
                const canvas = document.createElement('canvas');
                canvas.width = 224; // Teachable Machine standard size
                canvas.height = 224;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const sourceX = (roi.x / 100) * video.videoWidth;
                    const sourceY = (roi.y / 100) * video.videoHeight;
                    const sourceWidth = (roi.width / 100) * video.videoWidth;
                    const sourceHeight = (roi.height / 100) * video.videoHeight;
                    ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 224, 224);
                    input = canvas;
                }
            }

            const predictions = await model.predict(input);
            const filteredPredictions = predictions.filter(p => p.className.toLowerCase() !== "background");
            const result = interpretDetectionsLocal(filteredPredictions, confidenceThreshold);
            if (result.detectionState === 'SINGLE_OBJECT' && result.primaryObject) {
                const pred = filteredPredictions.find(p => p.className === result.primaryObject);
                if (pred) {
                    if (!stablePrediction || stablePrediction.className !== pred.className) {
                        setStablePrediction(pred);
                        if (detectionTimer.current) clearTimeout(detectionTimer.current);
                        detectionTimer.current = setTimeout(async () => {
                            const currentViewState = viewStateRef.current;
                            if (currentViewState === "IDLE" || currentViewState === "DETECTED") {
                                const preImages: string[] = [];
                                const burstCount = 10;
                                const burstInterval = 50;
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
                                setPreCapturedImages(preImages);
                                addLog(`Captured ${preImages.length} images before sorting. Reason: ${result.reason}`);
                                setDetectedLabel(pred.className);
                                setDetectionId(prev => prev + 1);
                                setAppStatus("DETECTED");
                                setViewState("DETECTED");
                                if (autoSortEnabled) {
                                    if (sorterStatus === "BUSY") {
                                        addLog(`Detected ${pred.className}, but sorter is BUSY. Skipping.`);
                                        return;
                                    }
                                    setAppStatus("SORTING");
                                    if (isConnected()) {
                                        const command = getArduinoCommand(pred.className);
                                        sendCommand(command)
                                            .then(() => {
                                                addLog(`Auto-sorted: ${pred.className} (Sent: ${command}).`);
                                            })
                                            .catch((error: any) => {
                                                console.error("Failed to send Bluetooth command:", error);
                                                addLog(`Sort command error: ${error.message}`);
                                            });
                                    } else {
                                        addLog(`Detected: ${pred.className}. Bluetooth not connected.`);
                                    }
                                } else {
                                    addLog(`Manual confirmation required for: ${pred.className}`);
                                }
                            }
                        }, DETECTION_SETTLE_DELAY);
                    }
                }
            } else if (result.detectionState === 'MULTIPLE_OBJECTS') {
                if (detectionTimer.current) {
                    clearTimeout(detectionTimer.current);
                    detectionTimer.current = null;
                }
                setStablePrediction(null);
            } else {
                if (detectionTimer.current && viewState === "IDLE") {
                    clearTimeout(detectionTimer.current);
                    detectionTimer.current = null;
                }
                setStablePrediction(null);
            }
        } catch (err: any) {
            const msg = err.message || "";
            if (msg.includes("stopTraining") || msg.includes("already be working") || msg.includes("compiled") || msg.includes("Sequential")) return;
            console.error("Prediction error:", err);
        } finally {
            isPredictingRef.current = false;
        }
    }, [model, viewState, appStatus, confidenceThreshold, stablePrediction, detectedLabel, addLog, autoSortEnabled, setAppStatus, getArduinoCommand]);

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
            if (streamRef.current) stopCamera();
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            } catch (err) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            streamRef.current = stream;
            setHasCameraPermission(true);
            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
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
            if (error.name === "NotReadableError") errorMessage = "Camera is in use by another app.";
            else if (error.name === "NotAllowedError") errorMessage = "Camera permission denied.";
            else if (error.name === "NotFoundError") errorMessage = "No camera found.";
            toast({ variant: "destructive", title: "Camera Error", description: errorMessage });
        }
    }, [stopCamera, setAppStatus, toast]);

    // --- 3. Effects ---

    useEffect(() => {
        const onConnected = () => setIsBtConnected(true);
        const onDisconnected = () => {
            setIsBtConnected(false);
            setAlcoholStatus(null);
            setAlcoholLevel(0);
            setBioTrash(0);
            setNonBioTrash(0);
            setEWasteTrash(0);
        };
        const onStatusUpdate = (e: Event) => {
            const detail = (e as CustomEvent<ESP32Status>).detail;
            if (detail.alcoholStatus) setAlcoholStatus(detail.alcoholStatus);
            if (detail.alcoholLevel !== undefined) setAlcoholLevel(detail.alcoholLevel);
            if (detail.sorterStatus) setSorterStatus(detail.sorterStatus.toUpperCase());
            if (detail.bioTrash !== undefined) setBioTrash(detail.bioTrash);
            if (detail.nonBioTrash !== undefined) setNonBioTrash(detail.nonBioTrash);
            if (detail.eWasteTrash !== undefined) setEWasteTrash(detail.eWasteTrash);
        };
        window.addEventListener('bt-connected', onConnected);
        window.addEventListener('bt-disconnected', onDisconnected);
        window.addEventListener('bt-status-update', onStatusUpdate);
        return () => {
            window.removeEventListener('bt-connected', onConnected);
            window.removeEventListener('bt-disconnected', onDisconnected);
            window.removeEventListener('bt-status-update', onStatusUpdate);
        }
    }, []);

    useEffect(() => {
        getSummaryStats().then(s => setTotalSorted(s.totalSorted));
        const unsubscribe = subscribeToStats((data) => {
            if (data.categoryStats) {
                const total = Object.values(data.categoryStats).reduce((sum, s) => sum + s.count, 0);
                setTotalSorted(total);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (model) startCamera();
        return () => stopCamera();
    }, [model, startCamera, stopCamera]);

    useEffect(() => {
        if (!stablePrediction && viewState === "IDLE") {
            const now = Date.now();
            if (now - lastLivePushRef.current > 2000) {
                lastLivePushRef.current = now;
                updateLiveDetection({
                    currentPrediction: null,
                    confidence: 0,
                    appStatus,
                    timestamp: now,
                    deviceId: 'client',
                }).catch(console.error);
            }
        } else if (stablePrediction) {
            const now = Date.now();
            if (now - lastLivePushRef.current > 500) {
                lastLivePushRef.current = now;
                updateLiveDetection({
                    currentPrediction: stablePrediction.className,
                    confidence: stablePrediction.probability,
                    appStatus,
                    timestamp: now,
                    deviceId: 'client',
                }).catch(console.error);
            }
        }
    }, [stablePrediction, appStatus, viewState]);

    useEffect(() => {
        if (isCameraOn && appStatus === "AWAITING_OBJECT") {
            predictionIntervalRef.current = setInterval(runClassification, PREDICTION_INTERVAL);
        }
        return () => {
            if (predictionIntervalRef.current) clearInterval(predictionIntervalRef.current);
        }
    }, [isCameraOn, appStatus, runClassification]);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (viewState === "DETECTED") {
            timeout = setTimeout(() => {
                handleCorrect();
                addLog("Auto-confirmation: Detection confirmed after 20s of inactivity.");
            }, 20000);
        }
        return () => clearTimeout(timeout);
    }, [viewState, detectedLabel, handleCorrect, addLog]);

    // Alcohol Level Notifications
    useEffect(() => {
        if (!isBtConnected) return;

        if (alcoholLevel <= 10 && alcoholLevel > 0) {
            toast({
                title: "Alcohol Low",
                description: `Alcohol is at ${alcoholLevel}%. Please refill soon.`,
                variant: "destructive"
            });
        }

        if (alcoholStatus === "EMPTY") {
            toast({
                title: "Alcohol Empty",
                description: "The alcohol container is empty! Please refill immediately.",
                variant: "destructive"
            });
        }
    }, [alcoholLevel, alcoholStatus, isBtConnected, toast]);

    // Trash Level Notifications
    useEffect(() => {
        if (!isBtConnected) return;

        const bins = [
            { label: 'Biodegradable', val: bioTrash },
            { label: 'Non-Biodegradable', val: nonBioTrash },
            { label: 'E-Waste', val: eWasteTrash }
        ];

        bins.forEach(bin => {
            if (bin.val >= 90) {
                toast({
                    title: `${bin.label} Bin Full`,
                    description: `The ${bin.label} bin is reached ${bin.val}%. Please empty it soon.`,
                    variant: "destructive"
                });
            }
        });
    }, [bioTrash, nonBioTrash, eWasteTrash, isBtConnected, toast]);

    // Subscribe to manual sort commands from admin
    useEffect(() => {
        const unsubscribe = subscribeToManualSortCommand((cmd) => {
            if (
                cmd &&
                cmd.status === 'pending' &&
                cmd.timestamp > lastProcessedSortTimestamp.current
            ) {
                lastProcessedSortTimestamp.current = cmd.timestamp;
                addLog(`Manual sort received from admin: ${cmd.command}`);
                if (isConnected()) {
                    sendCommand(cmd.command)
                        .then(() => {
                            addLog(`Manual sort executed via Bluetooth: ${cmd.command}`);
                            ackManualSortCommand().catch(console.error);
                        })
                        .catch((error: any) => {
                            console.error("Manual sort Bluetooth error:", error);
                            addLog(`Manual sort failed: ${error.message}`);
                        });
                } else {
                    addLog(`Manual sort received but Bluetooth not connected.`);
                    ackManualSortCommand().catch(console.error);
                }
            }
        });
        return () => unsubscribe();
    }, [addLog]);


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

            {/* Dynamic Status Banner (Top) */}
            <div className="absolute top-0 left-0 right-0 z-[60] p-4 flex justify-center">
                <div className={cn(
                    "w-full max-w-xl backdrop-blur-xl border-b border-x rounded-b-2xl px-6 py-3 transition-all duration-500 shadow-2xl flex items-center justify-between",
                    !isBtConnected ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                        sorterStatus === "BUSY" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                            "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            !isBtConnected ? "bg-rose-500" :
                                sorterStatus === "BUSY" ? "bg-amber-500 animate-pulse" :
                                    "bg-emerald-500"
                        )} />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">System Status</span>
                            <span className="text-sm font-bold tracking-tight">
                                {!isBtConnected ? "Sorter Disconnected" :
                                    sorterStatus === "BUSY" ? "Sorter Processing..." : "Sorter Ready"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Alcohol Level indicator */}
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Alcohol Level</span>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "text-sm font-mono font-bold",
                                    alcoholLevel <= 10 ? "text-rose-400 animate-pulse" : "text-white"
                                )}>
                                    {alcoholLevel}%
                                </span>
                                <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                    <div
                                        className={cn(
                                            "h-full transition-all duration-1000",
                                            alcoholLevel <= 10 ? "bg-rose-500" :
                                                alcoholLevel < 40 ? "bg-amber-500" : "bg-emerald-500"
                                        )}
                                        style={{ width: `${alcoholLevel}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Trash Level indicators (Mini) */}
                        <div className="hidden sm:flex gap-3 border-l border-white/10 pl-6">
                            {[
                                { label: 'BIO', val: bioTrash, color: 'bg-amber-500' },
                                { label: 'NON', val: nonBioTrash, color: 'bg-slate-400' },
                                { label: 'EWS', val: eWasteTrash, color: 'bg-purple-500' }
                            ].map(bin => (
                                <div key={bin.label} className="flex flex-col items-center">
                                    <span className="text-[8px] font-bold opacity-40">{bin.label}</span>
                                    <div className="w-1 h-4 bg-white/5 rounded-full overflow-hidden relative border border-white/5">
                                        <div
                                            className={cn("absolute bottom-0 w-full transition-all duration-1000", bin.val >= 90 ? "bg-rose-500 animate-pulse" : bin.color)}
                                            style={{ height: `${bin.val}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Original BT Status (Removed since we have the banner, or kept as redundant - User asked for banner like admin) */}
            {/* Let's keep it but move it lower or hide it if connected */}
            <div className="absolute top-4 right-4 z-50 pointer-events-none opacity-0 sm:opacity-100">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider transition-opacity",
                    isBtConnected ? "opacity-0" : "bg-rose-500/10 border-rose-500/50 text-rose-400"
                )}>
                    <div className={cn("w-2 h-2 rounded-full", isBtConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400")} />
                    {isBtConnected ? "Connected" : "Disconnected"}
                </div>
            </div>


            {/* --- MAIN CONTENT LAYERS --- */}

            {/* 1. IDLE STATE: "Enter the Smart Bin Era" */}
            {viewState === "IDLE" && (
                <div className="relative z-10 flex flex-col landscape:flex-row items-center justify-center landscape:justify-evenly h-full w-full animate-in fade-in zoom-in-95 duration-700 landscape:gap-4 landscape:px-6">
                    <div className="text-center space-y-2 mb-12 landscape:mb-0 landscape:space-y-1">
                        <h2 className="text-white font-medium tracking-widest uppercase text-sm landscape:text-xs">Enter the</h2>
                        <h1 className="text-6xl md:text-8xl landscape:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-cyan-500 drop-shadow-2xl">
                            Smart<br className="landscape:hidden" /> Bin<span className="text-2xl landscape:text-lg text-white font-normal ml-2">era!</span>
                        </h1>
                        <p className="text-emerald-400/80 tracking-widest text-xs landscape:text-[10px] uppercase mt-4 landscape:mt-1">— Ways of Waste Sustainability —</p>
                        {/* Stats moved inline for landscape */}
                        <div className="hidden landscape:block pt-2">
                            <div className="text-2xl font-bold text-white">{totalSorted}</div>
                            <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Items</div>
                        </div>
                    </div>

                    {/* Glowing Reticle */}
                    <div className="relative group">
                        <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-xl animate-pulse group-hover:bg-emerald-500/30 transition-all duration-1000" />
                        <div className="w-64 h-64 landscape:w-36 landscape:h-36 border-[3px] border-emerald-500/50 rounded-full flex items-center justify-center relative shadow-[0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-sm">
                            <div className="absolute top-0 w-4 h-4 landscape:w-3 landscape:h-3 bg-white rounded-full shadow-[0_0_10px_white] animate-ping" />

                            <div className="text-center">
                                <ArrowDown className="mx-auto h-8 w-8 landscape:h-5 landscape:w-5 text-white mb-2 landscape:mb-1 animate-bounce" />
                                <p className="text-white font-bold text-xl landscape:text-sm uppercase">Place Item</p>
                                <p className="text-white/60 text-xs landscape:text-[10px]">Waiting for object...</p>
                            </div>
                        </div>
                    </div>

                    {/* Stats - portrait only */}
                    <div className="absolute bottom-12 flex gap-8 landscape:hidden">
                        <div className="text-center">
                            <div className="text-3xl font-bold text-white transition-all duration-300 transform key={totalSorted}">{totalSorted}</div>
                            <div className="text-xxs text-emerald-400 uppercase tracking-wider">Items</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. DETECTED STATE: "Was it correct?" Split Screen */}
            {viewState === "DETECTED" && (() => {
                const materialConfig = getMaterialConfig(detectedLabel);
                const categoryLabel = getCategoryLabel(detectedLabel);
                return (
                    <div key={`${detectedLabel}-${detectionId}`} className="relative z-20 flex h-full w-full animate-in slide-in-from-bottom-10 fade-in duration-300 overflow-y-auto">
                        <div className="flex flex-col landscape:flex-row md:flex-row w-full h-full max-w-6xl mx-auto items-center p-4 landscape:p-3 md:p-12 gap-4 landscape:gap-3 md:gap-6">

                            {/* Left: Product Card */}
                            <div className="flex-shrink-0 landscape:flex-1 md:flex-1 w-full landscape:h-full md:h-full flex items-center justify-center">
                                <Card className="w-full max-w-[320px] landscape:max-w-none md:max-w-none landscape:w-full md:w-full h-auto landscape:h-full md:h-full landscape:max-h-full md:max-h-[600px] bg-[#f0f4f8] border-none shadow-2xl rounded-[2rem] landscape:rounded-2xl md:rounded-[3rem] flex flex-col items-center justify-center relative overflow-hidden p-4 landscape:p-3 md:p-8 py-6 landscape:py-3 md:py-8">
                                    <div className={cn("absolute top-0 w-full h-20 landscape:h-12 md:h-32", materialConfig.color, "opacity-20")} />

                                    <h2 className="text-2xl landscape:text-lg md:text-4xl font-extrabold text-slate-800 uppercase tracking-tight mb-4 landscape:mb-2 md:mb-8 z-10">{detectedLabel}</h2>

                                    {/* Material Icon with Dynamic Color */}
                                    <div className="w-36 h-36 landscape:w-20 landscape:h-20 md:w-64 md:h-64 relative z-10">
                                        <div className={cn(
                                            "w-full h-full bg-gradient-to-br rounded-2xl landscape:rounded-xl md:rounded-3xl transform rotate-3 shadow-xl flex items-center justify-center border-4 landscape:border-2 border-white/50",
                                            materialConfig.gradient
                                        )}>
                                            {categoryLabel === "E-Waste" && <Cpu className="w-24 h-24 landscape:w-12 landscape:h-12 md:w-48 md:h-48 text-white drop-shadow-md" />}
                                            {categoryLabel === "Biodegradable" && <Leaf className="w-24 h-24 landscape:w-12 landscape:h-12 md:w-48 md:h-48 text-white drop-shadow-md" />}
                                            {categoryLabel === "Non-Biodegradable" && <Trash2 className="w-24 h-24 landscape:w-12 landscape:h-12 md:w-48 md:h-48 text-white drop-shadow-md" />}
                                            {/* Fallback for unknown/other */}
                                            {!["E-Waste", "Biodegradable", "Non-Biodegradable"].includes(categoryLabel) && (
                                                <span className="text-6xl landscape:text-3xl md:text-8xl">{materialConfig.icon}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={cn(
                                        "mt-6 landscape:mt-2 md:mt-12 font-bold px-4 landscape:px-3 md:px-8 py-2 landscape:py-1 md:py-3 rounded-full text-sm landscape:text-xs md:text-xl uppercase tracking-widest shadow-lg z-10",
                                        materialConfig.color, "text-white"
                                    )}>
                                        {categoryLabel}
                                    </div>
                                </Card>
                            </div>

                            {/* Right: Feedback */}
                            <div className="flex-shrink-0 landscape:flex-1 md:flex-1 w-full landscape:h-full md:h-full flex flex-col items-center justify-center bg-white/5 backdrop-blur-md rounded-[2rem] landscape:rounded-2xl md:rounded-[3rem] border border-white/10 p-4 landscape:p-3 md:p-8 py-6 landscape:py-3 md:py-8 shadow-2xl">
                                <h3 className="text-3xl landscape:text-xl md:text-5xl font-bold text-white mb-6 landscape:mb-3 md:mb-12 text-center leading-tight drop-shadow-md">
                                    Was it <br className="landscape:hidden" /><span className="text-blue-400"> Correct?</span>
                                </h3>

                                <div className="flex gap-4 landscape:gap-3 md:gap-8 items-center">
                                    <Button
                                        onClick={handleIncorrect}
                                        className="h-24 w-24 landscape:h-16 landscape:w-16 md:h-40 md:w-40 rounded-full bg-rose-500 hover:bg-rose-600 border-4 landscape:border-2 border-white/20 shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <ThumbsDown className="h-12 w-12 landscape:h-8 landscape:w-8 md:h-20 md:w-20 text-white fill-white" />
                                    </Button>

                                    <Button
                                        onClick={handleCorrect}
                                        className="h-24 w-24 landscape:h-16 landscape:w-16 md:h-40 md:w-40 rounded-full bg-emerald-500 hover:bg-emerald-600 border-4 landscape:border-2 border-white/20 shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <ThumbsUp className="h-12 w-12 landscape:h-8 landscape:w-8 md:h-20 md:w-20 text-white fill-white" />
                                    </Button>
                                </div>

                                <p className="mt-6 landscape:mt-3 md:mt-12 text-white/40 text-xs landscape:text-[10px] md:text-sm">Item already sorted! Was it correct?</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 3. CORRECTION STATE */}
            {viewState === "CORRECTION" && (
                <div className="relative z-20 h-full w-full flex items-center justify-center p-4 landscape:p-2 bg-black/80 overflow-y-auto">
                    <Card className="w-full max-w-4xl bg-zinc-900 border-white/10 text-white p-8 landscape:p-4 rounded-3xl landscape:rounded-2xl shadow-2xl animate-in fade-in zoom-in-95">
                        <h2 className="text-3xl landscape:text-xl font-bold mb-6 landscape:mb-2 text-center">Correction Mode</h2>
                        <p className="text-zinc-400 text-center mb-8 landscape:mb-3 landscape:text-sm">What object is this actually?</p>

                        <div className="grid grid-cols-2 md:grid-cols-3 landscape:grid-cols-3 gap-4 landscape:gap-2">
                            {model.getClassLabels().filter(l => l.toLowerCase() !== 'background').map(label => (
                                <Button
                                    key={label}
                                    onClick={() => handleCorrectionSelect(label)}
                                    className="h-20 landscape:h-12 text-xl landscape:text-base font-semibold bg-zinc-800 hover:bg-emerald-600 hover:text-white border border-white/5 transition-all"
                                >
                                    {label}
                                </Button>
                            ))}
                            <Button
                                onClick={() => handleCorrectionSelect('background')}
                                className="h-20 landscape:h-12 text-xl landscape:text-base font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/5 col-span-2 md:col-span-3 landscape:col-span-3"
                            >
                                Nothing / Background
                            </Button>
                        </div>
                        <Button variant="ghost" className="w-full mt-8 landscape:mt-3 text-white/50 hover:text-white" onClick={handleManualReset}>Cancel</Button>
                    </Card>
                </div>
            )}

            {/* 4. THANK YOU STATE */}
            {viewState === "THANK_YOU" && (
                <div className="relative z-20 h-full w-full flex flex-col items-center justify-center bg-emerald-500/90 animate-in fade-in duration-300">
                    <div className="bg-white rounded-full p-8 landscape:p-4 shadow-2xl mb-6 landscape:mb-3 animate-bounce">
                        <Check className="h-32 w-32 landscape:h-16 landscape:w-16 text-emerald-500" />
                    </div>
                    <h1 className="text-6xl landscape:text-3xl font-black text-white uppercase tracking-tighter">Thank You!</h1>
                    <p className="text-emerald-100 text-xl landscape:text-sm mt-4 landscape:mt-2 max-w-md text-center">Sorting smarter, one item at a time.</p>
                </div>
            )}

        </div>
    );
}
