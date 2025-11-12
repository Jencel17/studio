
"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent, MutableRefObject } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";
import JSZip from "jszip";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Camera, CameraOff, Terminal, Flashlight, FlashlightOff, AlertTriangle, Upload, Hourglass, Wifi, CheckCircle, XCircle, TestTube, Download, Expand, Minimize, Sparkles, Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { type InterpretDetectionsOutput } from "@/app/actions/ai-schemas";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AppStatus } from "@/lib/types";
import { LogEntry } from "@/lib/types";


type Prediction = {
  className: string;
  probability: number;
};

type CommandStatus = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
};

type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

interface SortVisionClientProps {
    model: tmImage.CustomMobileNet | null;
    setModel: (model: tmImage.CustomMobileNet | null) => void;
    modelLabels: string[];
    appStatus: AppStatus;
    setAppStatus: (status: AppStatus) => void;
    esp32Ip: string;
    isTestMode: boolean;
    wakeLockEnabled: boolean;
    requestWakeLock: () => Promise<void>;
    releaseWakeLock: () => Promise<void>;
    autoCaptureEnabled: boolean;
    addLog: (message: string) => void;
    logs: LogEntry[];
    setLogs: (logs: LogEntry[]) => void;
    libsLoaded: boolean;
    cameraRestartDelay: number;
    tmImageRef: MutableRefObject<typeof tmImage | null>;
    tfRef: MutableRefObject<typeof tf | null>;
}

const CONFIDENCE_THRESHOLD = 0.8;
const PREDICTION_INTERVAL = 100;
const IMAGE_CAPTURE_COUNT = 20;
const IMAGE_CAPTURE_INTERVAL = 100;
const CAPTURE_COUNTDOWN_SECONDS = 3;
const AUTO_CAPTURE_TRIGGER_TIME = 2000; 
const AUTO_CAPTURE_COOLDOWN_TIME = 0;

const interpretDetectionsLocal = (
  predictions: Prediction[],
  confidenceThreshold: number
): InterpretDetectionsOutput => {
  const significantPredictions = predictions.filter(
    (p) => p.probability >= confidenceThreshold
  );

  if (significantPredictions.length === 0) {
    if (predictions.some(p => p.probability > 0.5)) {
      return {
        detectionState: "AMBIGUOUS",
        reason: `Highest confidence is below threshold.`
      }
    }
    return {
      detectionState: "NO_DETECTION",
      reason: "No prediction meets the confidence threshold.",
    };
  }

  const sortedPredictions = [...predictions].sort((a,b) => b.probability - a.probability);
  const topPrediction = sortedPredictions[0];

  if(topPrediction.probability < confidenceThreshold){
    return {
      detectionState: "AMBIGUOUS",
      reason: `Highest confidence (${topPrediction.probability.toFixed(2)}) is below threshold.`,
    };
  }
  
  const secondPrediction = sortedPredictions.length > 1 ? sortedPredictions[1] : null;
  if (secondPrediction) {
    if (secondPrediction.probability >= confidenceThreshold) {
      return {
          detectionState: "MULTIPLE_OBJECTS",
          detectedObjects: significantPredictions.map((p) => p.className),
          reason: "Multiple objects detected above confidence threshold.",
      };
    }
    if (topPrediction.probability < secondPrediction.probability * 2) {
       return {
        detectionState: "AMBIGUOUS",
        reason: "Confidence scores are too close to make a clear decision.",
      };
    }
  }

  return {
    detectionState: "SINGLE_OBJECT",
    primaryObject: topPrediction.className,
    reason: `Single object detected with high confidence: ${topPrediction.className}.`,
  };
};

export default function SortVisionClient({
    model,
    setModel,
    modelLabels,
    appStatus,
    setAppStatus,
    esp32Ip,
    isTestMode,
    wakeLockEnabled,
    requestWakeLock,
    releaseWakeLock,
    autoCaptureEnabled,
    addLog,
    logs,
    setLogs,
    libsLoaded,
    cameraRestartDelay,
    tmImageRef,
    tfRef
}: SortVisionClientProps) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isFocusLocked, setIsFocusLocked] = useState(false);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [isConsoleFullscreen, setIsConsoleFullscreen] = useState(false);
  const [detectionState, setDetectionState] = useState<DetectionState>("NO_DETECTION");
  const [primaryPrediction, setPrimaryPrediction] = useState<Prediction | null>(null);
  const [currentPredictions, setCurrentPredictions] = useState<Prediction[]>([]);
  const [isCollectingImages, setIsCollectingImages] = useState(false);
  const [collectedImages, setCollectedImages] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [commandStatus, setCommandStatus] = useState<CommandStatus>({ status: "IDLE", message: "Awaiting command." });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout>();
  const ambiguousDetectionTimer = useRef<NodeJS.Timeout | null>(null);
  

  const { toast } = useToast();

    const sendLightCommand = useCallback(async (state: 'ON' | 'OFF') => {
        if (isTestMode) {
          addLog(`TEST MODE: Simulating light ${state} command.`);
          return true;
        }
        if (window.location.protocol === 'https:' && esp32Ip.startsWith('http://')) {
            addLog("SecurityError: Cannot send insecure 'http' light command from secure 'https' page.");
            return false;
        }

        const url = `${esp32Ip}/light?state=${state}`;
        addLog(`Sending light command to ESP32: ${url}`);
        try {
            const response = await fetch(url, { method: 'GET' });
            if (response.ok) {
                addLog(`Successfully sent light ${state} command.`);
                return true;
            } else {
                addLog(`Error: ESP32 responded with ${response.status} for light command.`);
                return false;
            }
        } catch (error: any) {
            addLog(`Error sending light command: ${error.message}`);
            return false;
        }
    }, [esp32Ip, isTestMode, addLog]);
  
  const startImageCollection = useCallback(async () => {
    if (!isCameraOn || !hasCameraPermission || isCollectingImages) return;

    if (predictionIntervalRef.current) {
        clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = undefined;
    }
    
    await sendLightCommand('ON');

    setIsCollectingImages(true);
    setAppStatus("COLLECTING_IMAGES");
    setCollectedImages([]);
    setCountdown(CAPTURE_COUNTDOWN_SECONDS);
    addLog(`Starting image capture in ${CAPTURE_COUNTDOWN_SECONDS} seconds.`);

  }, [isCameraOn, hasCameraPermission, isCollectingImages, addLog, setAppStatus, sendLightCommand]);

  const stopCamera = useCallback(() => {
    addLog("Stopping camera.");
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
     if (ambiguousDetectionTimer.current) {
      clearTimeout(ambiguousDetectionTimer.current);
      ambiguousDetectionTimer.current = null;
    }
    streamRef.current = null;
    setIsCameraOn(false);
    setIsFocusLocked(false);
    setPrimaryPrediction(null);
    setCurrentPredictions([]);
    setDetectionState("NO_DETECTION");
    releaseWakeLock();
  }, [releaseWakeLock, addLog]);

const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addLog("Camera API not available in this browser.");
        toast({ variant: "destructive", title: "Unsupported Browser", description: "Camera access is not available." });
        setHasCameraPermission(false);
        return;
    }
    
    if (streamRef.current) {
        stopCamera();
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    addLog("Requesting camera access...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        setHasCameraPermission(true);
        
        const video = videoRef.current;
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play().then(() => {
                    setIsCameraOn(true);
                    setAppStatus(model ? "AWAITING_OBJECT" : "AWAITING_MODEL");
                    addLog("Camera started successfully.");
                    if (wakeLockEnabled) {
                        requestWakeLock();
                    }
                }).catch((error) => {
                    console.error("Video play failed:", error);
                    addLog(`Video play error: ${error.message}`);
                    // Specific error for play interruption
                    if (error.name === 'AbortError') {
                        addLog('Video play was aborted, likely by a component re-render. This is often safe to ignore.');
                    } else if (error.name === 'NotAllowedError') {
                        toast({ variant: 'destructive', title: 'Playback Error', description: 'Auto-play was blocked by the browser. Please press Start again.' });
                        stopCamera();
                    }
                });
            };
        }
    } catch (error: any) {
        console.error("Error accessing camera:", error);
        addLog(`Camera Error: ${error.message}`);
        setHasCameraPermission(false);
        toast({
            variant: "destructive",
            title: "Camera Access Denied",
            description: "Please enable camera permissions in your browser settings.",
        });
        stopCamera();
    }
}, [addLog, model, setAppStatus, stopCamera, toast, wakeLockEnabled, requestWakeLock]);


  const toggleFlash = useCallback(async () => {
    if (!isCameraOn || !streamRef.current) {
        addLog("Cannot toggle flash: Camera is off.");
        return;
    }
    
    const newFlashState = !isFlashOn;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities();

    if (capabilities.torch) {
        try {
            addLog(`Attempting to set flash to: ${newFlashState ? 'ON' : 'OFF'}`);
            await videoTrack.applyConstraints({
                advanced: [{ torch: newFlashState }]
            });
            setIsFlashOn(newFlashState);
            addLog(`Flash is now ${newFlashState ? 'ON' : 'OFF'}.`);
        } catch (error: any) {
            console.error("Failed to toggle flash:", error);
            addLog(`Flash Error: ${error.message}`);
            toast({
                variant: "destructive",
                title: "Flash Control Failed",
                description: "Could not change the flash setting.",
            });
        }
    } else {
        addLog("Flash/torch not supported on this device.");
        toast({
            variant: "destructive",
            title: "Flash Not Supported",
            description: "This device's camera does not support flash control.",
        });
    }
}, [isCameraOn, isFlashOn, addLog, toast]);

const toggleFocus = useCallback(async () => {
    if (!isCameraOn || !streamRef.current) {
      addLog("Cannot change focus: Camera is off.");
      return;
    }

    const videoTrack = streamRef.current.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities();
    // @ts-ignore - focusMode is a valid capability but not in all TS libs.
    if (!capabilities.focusMode) {
      addLog("Focus control not supported on this device.");
      toast({
        variant: "destructive",
        title: "Focus Not Supported",
        description: "This device's camera does not support focus control.",
      });
      return;
    }

    const newFocusState = !isFocusLocked;
    try {
      if (newFocusState) {
        // To lock focus, we set it to 'manual'
        addLog("Locking camera focus.");
        await videoTrack.applyConstraints({
          // @ts-ignore
          advanced: [{ focusMode: 'manual' }],
        });
        setIsFocusLocked(true);
        addLog("Focus locked.");
        toast({ title: 'Focus Locked' });
      } else {
        // To unlock, we set it back to 'continuous' (autofocus)
        addLog("Unlocking camera focus (enabling autofocus).");
        await videoTrack.applyConstraints({
          // @ts-ignore
          advanced: [{ focusMode: 'continuous' }],
        });
        setIsFocusLocked(false);
        addLog("Focus unlocked.");
        toast({ title: 'Focus Unlocked (Autofocus Enabled)' });
      }
    } catch (error: any) {
      console.error("Failed to toggle focus:", error);
      addLog(`Focus Error: ${error.message}`);
      toast({
        variant: "destructive",
        title: "Focus Control Failed",
        description: "Could not change the focus setting.",
      });
    }
  }, [isCameraOn, isFocusLocked, addLog, toast]);

  const sendSortCommand = useCallback(async (classificationLabel: string) => {
    if (isTestMode) {
      addLog(`TEST MODE: Simulating command for ${classificationLabel}`);
      setCommandStatus({ status: "SUCCESS", message: `Test: Sorted ${classificationLabel}` });
      toast({ title: "Command Sent (Test Mode)", description: `Simulated sort for: ${classificationLabel}` });
      return;
    }

    if (window.location.protocol === 'https:' && esp32Ip.startsWith('http://')) {
        const errorMsg = "SecurityError: Cannot fetch from an insecure 'http' endpoint from a secure 'https' page. This is a browser security feature to prevent mixed content.";
        addLog(errorMsg);
        setCommandStatus({ status: "ERROR", message: "Mixed content error. See console." });
        toast({ variant: "destructive", title: "Network Error", description: "Cannot send command due to browser security (mixed content)." });
        return;
    }

    const url = `${esp32Ip}/sort?class=${classificationLabel.toUpperCase()}`;
    addLog(`Sending command to ESP32: ${url}`);
    
    try {
      const response = await fetch(url, { method: 'GET' });
      
      if (response.ok) {
        setCommandStatus({ status: "SUCCESS", message: `Success: Sorted ${classificationLabel}` });
        addLog(`Successfully sent command for ${classificationLabel}`);
        toast({ title: "Command Sent", description: `Sorted: ${classificationLabel}`});
      } else {
        const errorText = `Error: ESP32 responded with ${response.status}`;
        setCommandStatus({ status: "ERROR", message: errorText });
        addLog(errorText);
        toast({ variant: "destructive", title: "ESP32 Error", description: `Received status ${response.status}` });
      }
    } catch (error: any) {
      console.error("Failed to send command to ESP32:", error);
      const errorMessage = `Error: Cannot reach ESP32. ${error.message}`;
      setCommandStatus({ status: "ERROR", message: errorMessage });
      addLog(`${errorMessage}`);
      toast({ variant: "destructive", title: "ESP32 Error", description: "Could not send command." });
    }
  }, [addLog, toast, esp32Ip, isTestMode]);

 const handleSortAndRestart = useCallback(async (classification: string) => {
    stopCamera();
    
    setAppStatus("CAMERA_CYCLING");
    addLog(`Command sent for ${classification}. Restarting camera in ${cameraRestartDelay} seconds...`);
    
    await sendLightCommand('OFF');

    if (classification !== "RESTART_NO_SORT") {
        await sendSortCommand(classification);
    }

    const delayInMs = cameraRestartDelay * 1000;
    setTimeout(() => {
        addLog("Restarting camera now.");
        startCamera();
    }, delayInMs);

}, [stopCamera, addLog, sendSortCommand, startCamera, setAppStatus, cameraRestartDelay, sendLightCommand]);

 const runClassification = useCallback(async () => {
    if (!isCameraOn || !videoRef.current?.srcObject || !model || !streamRef.current?.active) {
      return;
    }
  
    const video = videoRef.current;
    if (video.readyState < video.HAVE_ENOUGH_DATA) {
        return; 
    }

    const predictions = await model.predict(video);
    setCurrentPredictions(predictions);

    const filteredPredictions = predictions.filter(
        (p) => p.className.toLowerCase() !== "background"
    );

    const localResult = interpretDetectionsLocal(
      filteredPredictions,
      CONFIDENCE_THRESHOLD
    );

    setDetectionState(localResult.detectionState);
    let newAppStatus: AppStatus = appStatus;
    
    if (localResult.detectionState === 'SINGLE_OBJECT' && localResult.primaryObject) {
      const foundPrediction = filteredPredictions.find(p => p.className === localResult.primaryObject);
      if (foundPrediction) {
          setPrimaryPrediction(foundPrediction);
          setLastClassifications(prev => [...prev, foundPrediction]);
          newAppStatus = "READY_TO_SEND";
          setAppStatus(newAppStatus);
          
          if (predictionIntervalRef.current) {
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = undefined;
          }

          addLog(`Initial detection: ${foundPrediction.className}. Turning on light for final check.`);
          await sendLightCommand('ON');
          
          setTimeout(async () => {
            if (!videoRef.current) { 
                await sendLightCommand('OFF');
                return;
            }
            addLog("Re-classifying with light on...");
            const finalPredictions = await model.predict(video);
            const finalFiltered = finalPredictions.filter(p => p.className.toLowerCase() !== 'background');
            const finalResult = interpretDetectionsLocal(finalFiltered, CONFIDENCE_THRESHOLD);

            if (finalResult.detectionState === 'SINGLE_OBJECT' && finalResult.primaryObject) {
                addLog(`Final confirmation: ${finalResult.primaryObject}. Sorting.`);
                handleSortAndRestart(finalResult.primaryObject);
            } else {
                addLog(`Final check failed. Result: ${finalResult.detectionState}. Restarting camera.`);
                handleSortAndRestart("RESTART_NO_SORT");
            }
          }, 500);


      } else {
        setPrimaryPrediction(null);
      }
    } else {
      setPrimaryPrediction(null);
      const isUncertain = localResult.detectionState === 'AMBIGUOUS' || (localResult.detectionState === 'NO_DETECTION' && filteredPredictions.some(p => p.probability > 0.5));
      newAppStatus = isUncertain ? "CONFIDENCE_TOO_LOW" : "AWAITING_OBJECT";
      if (appStatus !== newAppStatus) {
        setAppStatus(newAppStatus);
      }
    }

    if (autoCaptureEnabled && !isCollectingImages && newAppStatus === "CONFIDENCE_TOO_LOW" && appStatus !== 'COOLDOWN' && appStatus !== 'CAMERA_CYCLING') {
      if (!ambiguousDetectionTimer.current) {
        addLog(`Uncertain detection. Triggering training image capture in ${AUTO_CAPTURE_TRIGGER_TIME / 1000}s.`);
        ambiguousDetectionTimer.current = setTimeout(() => {
          addLog("Threshold met. Starting automatic training image capture.");
          startImageCollection();
          ambiguousDetectionTimer.current = null;
        }, AUTO_CAPTURE_TRIGGER_TIME);
      }
    } else {
      if (ambiguousDetectionTimer.current) {
        addLog("Detection became clear or changed state. Cancelling auto-capture trigger.");
        clearTimeout(ambiguousDetectionTimer.current);
        ambiguousDetectionTimer.current = null;
      }
    }
  }, [isCameraOn, model, appStatus, autoCaptureEnabled, isCollectingImages, addLog, setAppStatus, startImageCollection, handleSortAndRestart, sendLightCommand]);

  useEffect(() => {
    return () => {
      if(isCameraOn) {
        stopCamera();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined = undefined;
    if (countdown > 0) {
        timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isCollectingImages && countdown === 0) {
        const captureInterval = setInterval(() => {
            setCollectedImages(prev => {
                if (prev.length >= IMAGE_CAPTURE_COUNT) {
                    clearInterval(captureInterval);
                    return prev;
                }
                if (!videoRef.current) {
                    clearInterval(captureInterval);
                    return prev;
                }

                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                    const dataUri = canvas.toDataURL('image/jpeg');
                    addLog(`Captured image ${prev.length + 1}/${IMAGE_CAPTURE_COUNT}`);
                    return [...prev, dataUri];
                }
                return prev;
            });
        }, IMAGE_CAPTURE_INTERVAL);
        return () => clearInterval(captureInterval);
    }
    return () => clearTimeout(timer);
}, [countdown, isCollectingImages, addLog]);


  useEffect(() => {
    const zipAndDownloadImages = async () => {
        addLog(`Collected ${collectedImages.length} images. Zipping...`);
        toast({ title: "Zipping Images", description: "Preparing images for download..." });
        
        const zip = new JSZip();
        collectedImages.forEach((dataUri, index) => {
            const base64Data = dataUri.split(',')[1];
            zip.file(`image_${index + 1}.jpg`, base64Data, { base64: true });
        });

        try {
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `unidentified-images-${timestamp}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            addLog("Image archive downloaded successfully.");
            toast({ title: "Download Complete", description: "Training images saved." });
        } catch (error: any) {
            console.error("Failed to create zip file:", error);
            addLog(`Error creating zip file: ${error.message}`);
            toast({ variant: "destructive", title: "Zip Error", description: "Could not create image archive." });
        } finally {
            setIsCollectingImages(false);
            setCollectedImages([]);
            await sendLightCommand('OFF');
            if (autoCaptureEnabled) {
              setAppStatus("COOLDOWN");
              addLog(`Auto-capture finished. Entering ${AUTO_CAPTURE_COOLDOWN_TIME / 1000}s cooldown.`);
              setTimeout(() => {
                setAppStatus("AWAITING_OBJECT");
                addLog("Cooldown finished. Resuming analysis.");
              }, AUTO_CAPTURE_COOLDOWN_TIME);
            } else {
               setAppStatus("AWAITING_OBJECT");
            }
        }
    };
    
    if (isCollectingImages && collectedImages.length >= IMAGE_CAPTURE_COUNT) {
        zipAndDownloadImages();
    }
}, [collectedImages, isCollectingImages, addLog, toast, autoCaptureEnabled, setAppStatus, sendLightCommand]);

  useEffect(() => {
    if (isCameraOn && model && !predictionIntervalRef.current && !isCollectingImages && appStatus !== 'COOLDOWN' && appStatus !== 'CAMERA_CYCLING') {
        addLog("Starting classification loop.");
        predictionIntervalRef.current = setInterval(runClassification, PREDICTION_INTERVAL);
    } else if ((!isCameraOn || !model || isCollectingImages || appStatus === 'COOLDOWN' || appStatus === 'CAMERA_CYCLING') && predictionIntervalRef.current) {
        addLog("Stopping classification loop.");
        clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = undefined;
    }

    return () => {
        if (predictionIntervalRef.current) {
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = undefined;
            addLog("Cleaned up classification loop.");
        }
    };
  }, [isCameraOn, model, runClassification, addLog, isCollectingImages, appStatus]);
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isCameraOn) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestWakeLock, isCameraOn]);

  useEffect(() => {
    const checkModelPerformance = async () => {
      if (model && lastClassifications.length >= 20) {
        addLog(`Checking model performance with ${lastClassifications.length} classifications.`);
        const classificationsToAnalyze = [...lastClassifications];
        setLastClassifications([]);

        const scores: { [key: string]: number[] } = {};
         model?.getClassLabels().forEach(label => {
            scores[label] = [];
        });

        classificationsToAnalyze.forEach(p => {
            if (p.className in scores) {
                scores[p.className].push(p.probability);
            }
        });
        
        const averageConfidenceScores: Record<string, number> = {};
        for(const label in scores) {
            if(scores[label].length > 0) {
                averageConfidenceScores[label] = scores[label].reduce((a, b) => a + b, 0) / scores[label].length;
            } else {
                averageConfidenceScores[label] = 0;
            }
        }
        
        addLog(`Requesting AI analysis for model performance. Avg scores: ${JSON.stringify(averageConfidenceScores)}`);
        try {
          const result = await handleModelSwapCheck({
              averageConfidenceScores,
              numClassifications: classificationsToAnalyze.length,
          });

          if (result.shouldSuggestSwap) {
            addLog(`AI Suggestion: ${result.reason}`);
            toast({
              title: "Model Performance Suggestion",
              description: result.reason,
              duration: 9000,
            });
          } else {
              addLog(`AI Suggestion: No model swap needed. ${result.reason}`);
          }
        } catch (e) {
          addLog("Could not get model performance suggestion.");
        }
      }
    };

    checkModelPerformance();
  }, [lastClassifications, toast, addLog, model]);
  
  const StatusDisplay = () => {
    const getStatusText = () => {
        switch (appStatus) {
            case "AWAITING_MODEL": return "Awaiting Model";
            case "LOADING_LIBS": return "Loading AI libs...";
            case "MODEL_LOADING": return "Loading Model...";
            case "AWAITING_OBJECT": return "Awaiting Object";
            case "CONFIDENCE_TOO_LOW": return "Confidence Too Low";
            case "CAMERA_CYCLING": return "Camera Restarting...";
            case "COLLECTING_IMAGES": return "Collecting Images...";
            case "COOLDOWN": return "Auto-Capture Cooldown";
            case "READY_TO_SEND":
                return `Sending: ${primaryPrediction?.className || '...'}`;
            default: return "Analyzing...";
        }
    };

    const getStatusBadgeVariant = () => {
        switch (appStatus) {
            case "READY_TO_SEND": return "default";
            case "COLLECTING_IMAGES": return "default";
            case "AWAITING_MODEL": return "secondary";
            case "COOLDOWN":
            case "LOADING_LIBS":
            case "MODEL_LOADING":
            case "CAMERA_CYCLING": return "secondary";
            case "CONFIDENCE_TOO_LOW": return "destructive";
            default: return "outline";
        }
    };

    const isLoading = appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || appStatus === 'CAMERA_CYCLING' || appStatus === 'COLLECTING_IMAGES' || appStatus === 'COOLDOWN';

    return (
        <div className="flex flex-col items-end gap-2">
             <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant={getStatusBadgeVariant()} className="text-xs">
                    {isLoading && <Hourglass className="h-3 w-3 mr-1 animate-spin" />}
                    {appStatus === 'ANALYZING_MATERIAL' && <Sparkles className="h-3 w-3 mr-1 animate-pulse" />}
                    {getStatusText()}
                </Badge>
                <Badge variant={isTestMode ? "default" : "outline"} className="gap-2 text-xs">
                    {isTestMode ? <TestTube className="h-3 w-3" /> : <Wifi className="h-3 w-3"/>}
                    {isTestMode ? "Test Mode" : esp32Ip}
                </Badge>
            </div>
             <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {commandStatus.status === 'IDLE' && <p>{commandStatus.message}</p>}
                {commandStatus.status === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {commandStatus.status === 'ERROR' && <XCircle className="h-4 w-4 text-red-500" />}
                <p className="truncate">{commandStatus.status !== 'IDLE' && commandStatus.message}</p>
            </div>
        </div>
    );
};


  const PredictionDisplay = () => {
    const renderContent = () => {
        if (!isCameraOn) {
            if (!hasCameraPermission) {
                return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-4 text-center">
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Camera Access Required</AlertTitle>
                            <AlertDescription>
                                Please allow camera access in your browser settings to use this feature.
                            </AlertDescription>
                        </Alert>
                    </div>
                );
            }
            return (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <CameraOff className="h-16 w-16 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">Camera is off</p>
              </div>
            );
        }

        if (countdown > 0) {
            return <h3 className="text-6xl font-bold text-white drop-shadow-lg animate-ping">{countdown}</h3>;
        }

        if (isCollectingImages) {
            return (
                <div className="w-full max-w-xs text-center">
                    <p className="text-lg text-white/90 shadow-md mb-2">Capturing...</p>
                    <Progress value={(collectedImages.length / IMAGE_CAPTURE_COUNT) * 100} className="h-2 w-full bg-white/30" />
                </div>
            );
        }

        if (appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || !model) {
           return (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Upload className="h-16 w-16 text-muted-foreground animate-pulse" />
                  <p className="mt-2 text-muted-foreground">{appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' ? 'Loading Model...' : 'Please load a model from settings.'}</p>
              </div>
            );
        }

        if (appStatus === 'ANALYZING_MATERIAL') {
             return (
                <div className="flex items-center gap-2">
                    <Sparkles className="h-6 w-6 text-blue-400 animate-pulse" />
                    <h3 className="text-xl font-bold text-blue-400 drop-shadow-lg">
                        Analyzing Material...
                    </h3>
                </div>
            );
        }
       
        switch (detectionState) {
            case "SINGLE_OBJECT":
                if (primaryPrediction) {
                    return (
                        <>
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                                {primaryPrediction.className}
                            </h3>
                            <div className="flex items-center gap-2">
                                <p className="text-sm text-white/90 drop-shadow-md">
                                    Confidence:
                                </p>
                                <Progress value={primaryPrediction.probability * 100} className="h-2 w-24 bg-white/30" />
                                <span className="text-sm font-semibold text-white">
                                    {(primaryPrediction.probability * 100).toFixed(0)}%
                                </span>
                            </div>
                        </>
                    );
                }
                return <p className="text-lg text-white/90 shadow-md">Analyzing...</p>;
            case "MULTIPLE_OBJECTS":
            case "AMBIGUOUS":
                 return (
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-yellow-400" />
                        <h3 className="text-xl font-bold text-yellow-400 drop-shadow-lg">
                           {detectionState === 'AMBIGUOUS' ? 'Ambiguous Detection' : 'Multiple Objects'}
                        </h3>
                    </div>
                );
            case "NO_DETECTION":
            default:
                if (appStatus === 'CONFIDENCE_TOO_LOW') {
                    return (
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-6 w-6 text-yellow-400" />
                            <h3 className="text-xl font-bold text-yellow-400 drop-shadow-lg">
                                Confidence Too Low
                            </h3>
                        </div>
                    );
                }
                return <p className="text-lg text-white/90 shadow-md">Analyzing...</p>;
        }
    };
    
    return (
        <div className={cn("absolute inset-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex flex-col items-center", isCollectingImages || countdown > 0 ? "justify-center" : "justify-start")}>
             {renderContent()}
        </div>
    );
  };

  const DetectionRates = () => {
    const getProbability = (label: string) => {
        const prediction = currentPredictions.find(p => p.className === label);
        return prediction ? prediction.probability : 0;
    };

    return (
        <div className="flex flex-col justify-center h-full w-full p-4 space-y-3">
            {modelLabels.length > 0 ? (
                modelLabels.filter(l => l.toLowerCase() !== 'background').map(label => {
                    const probability = getProbability(label);
                    const percentage = probability * 100;
                    return (
                        <div key={label} className="w-full space-y-1">
                            <div className="flex justify-between items-center text-sm">
                                <span className="capitalize text-muted-foreground">{label}</span>
                                <span className="font-semibold">
                                    {percentage.toFixed(1)}%
                                </span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                        </div>
                    );
                })
            ) : (
                <p className="text-sm text-muted-foreground text-center">Load a model to see categories.</p>
            )}
        </div>
    );
  };

  const LogViewer = ({ fullscreen }: {fullscreen: boolean}) => {
    return (
      <ScrollArea className={cn("w-full my-4", fullscreen ? "flex-1" : "h-[150px]")}>
        <div className="p-4 font-mono text-xs">
          {logs.map((log, index) => (
            <p key={index}>
              <span className="text-muted-foreground/50">{log.timestamp}</span>
              <span className="ml-2 text-foreground">{log.message}</span>
            </p>
          ))}
        </div>
      </ScrollArea>
    );
  };

  return (
      <Card className="w-full max-w-4xl shadow-2xl bg-card/80 backdrop-blur-sm border-border/20 flex flex-col">
        <CardHeader className="flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="sm:hidden">
              <SidebarTrigger />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">SortVision</CardTitle>
              <CardDescription>AI-Powered Waste Classification</CardDescription>
            </div>
          </div>
          <StatusDisplay />
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-4">
          <div className={cn("grid md:grid-cols-[1fr_auto] gap-4 items-center", isConsoleFullscreen && "hidden")}>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/50 border-2 border-border/30">
                <video
                    ref={videoRef}
                    className="h-full w-full object-cover"
                    playsInline
                    muted
                    autoPlay
                />
                <PredictionDisplay />
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border-2 border-dashed border-border/20 h-full w-[240px]">
                <DetectionRates />
              </div>
          </div>
          <Accordion type="single" collapsible className="w-full" defaultValue="console">
            <AccordionItem value="console" className="border-b-0">
                <AccordionTrigger className="text-sm font-semibold hover:no-underline">Console</AccordionTrigger>
                <AccordionContent className="flex flex-col">
                    <LogViewer fullscreen={isConsoleFullscreen}/>
                     <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsConsoleFullscreen(!isConsoleFullscreen)} size="icon">
                        {isConsoleFullscreen ? <Minimize /> : <Expand />}
                      </Button>
                      <Button variant="outline" onClick={() => setLogs([])}>Clear Logs</Button>
                    </div>
                </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-4 items-center pt-6">
            <div className="hidden sm:flex items-center">
              <SidebarTrigger />
              <p className="text-xs text-muted-foreground ml-2">Press <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">⌘</kbd> <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">B</kbd> to toggle.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
              <Button onClick={toggleCamera} variant="outline" className="flex-grow sm:flex-grow-0" disabled={!model || isCollectingImages}>
                {isCameraOn ? <CameraOff /> : <Camera />}
                {isCameraOn ? "Stop" : "Start"}
              </Button>
               <Button onClick={toggleFlash} variant="outline" size="icon" disabled={!isCameraOn || isCollectingImages}>
                {isFlashOn ? <FlashlightOff /> : <Flashlight />}
              </Button>
              <Button onClick={toggleFocus} variant="outline" size="icon" disabled={!isCameraOn || isCollectingImages}>
                {isFocusLocked ? <Unlock /> : <Lock />}
              </Button>
              <Button onClick={startImageCollection} variant="outline" size="icon" disabled={!isCameraOn || isCollectingImages}>
                <Download />
              </Button>
            </div>
        </CardFooter>
      </Card>
  );
}

    