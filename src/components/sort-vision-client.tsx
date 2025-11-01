
"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
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
import { Camera, CameraOff, Terminal, Flashlight, FlashlightOff, AlertTriangle, Upload, Hourglass, Wifi, CheckCircle, XCircle, TestTube, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { type InterpretDetectionsOutput } from "@/app/actions/ai-schemas";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Prediction = {
  className: string;
  probability: number;
};

type LogEntry = {
  timestamp: string;
  message: string;
};

type AppStatus = "AWAITING_MODEL" | "LOADING_LIBS" | "LIBS_LOADED"| "MODEL_LOADING" | "AWAITING_OBJECT" | "CONFIDENCE_TOO_LOW" | "READY_TO_SEND" | "CAMERA_CYCLING" | "COLLECTING_IMAGES" | "COOLDOWN";

type CommandStatus = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
};

type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

type TeachableMachine = typeof import("@teachablemachine/image");
type TensorFlow = typeof import("@tensorflow/tfjs");

interface SortVisionClientProps {
    model: tmImage.CustomMobileNet | null;
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
}

const CAMERA_RESTART_DELAY = 3000;
const CONFIDENCE_THRESHOLD = 0.8;
const MAX_LOGS = 100;
const PREDICTION_INTERVAL = 100;
const IMAGE_CAPTURE_COUNT = 20;
const IMAGE_CAPTURE_INTERVAL = 100;
const CAPTURE_COUNTDOWN_SECONDS = 3;
const AUTO_CAPTURE_TRIGGER_TIME = 2000; // 2 seconds
const AUTO_CAPTURE_COOLDOWN_TIME = 10000; // 10 seconds

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
}: SortVisionClientProps) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
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
  
  const startImageCollection = useCallback(() => {
    if (!isCameraOn || isCollectingImages) return;

    if (predictionIntervalRef.current) {
        clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = undefined;
    }

    setIsCollectingImages(true);
    setAppStatus("COLLECTING_IMAGES");
    setCollectedImages([]);
    setCountdown(CAPTURE_COUNTDOWN_SECONDS);
    addLog(`Starting image capture in ${CAPTURE_COUNTDOWN_SECONDS} seconds.`);

  }, [isCameraOn, isCollectingImages, addLog, setAppStatus]);

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
      addLog("Classification loop stopped.");
    }
     if (ambiguousDetectionTimer.current) {
      clearTimeout(ambiguousDetectionTimer.current);
      ambiguousDetectionTimer.current = null;
    }
    streamRef.current = null;
    setIsCameraOn(false);
    setIsFlashOn(false);
    setPrimaryPrediction(null);
    setCurrentPredictions([]);
    setDetectionState("NO_DETECTION");
    if(appStatus !== 'COLLECTING_IMAGES') {
      setAppStatus(model ? "AWAITING_OBJECT" : "AWAITING_MODEL");
    }
    releaseWakeLock();
  }, [releaseWakeLock, addLog, model, appStatus, setAppStatus]);

  const startCamera = useCallback(async (flashEnabled?: boolean) => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const useFlash = flashEnabled ?? isFlashOn;

      try {
        addLog("Requesting camera access...");

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: { 
            facingMode: "environment",
            advanced: [{ torch: useFlash }]
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        streamRef.current = stream;
        setIsCameraOn(true);
        setAppStatus(model ? "AWAITING_OBJECT" : "AWAITING_MODEL");

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities();
          const settings = videoTrack.getSettings();
          if (capabilities.torch) {
              setIsFlashOn(!!settings.torch);
          } else {
              setIsFlashOn(false);
              if (useFlash) {
                  addLog("Flash/torch not supported on this device.");
                  toast({ variant: "destructive", title: "Flash Not Supported", description: "This device does not support camera flash control." });
              }
          }
        }
        
        addLog(`Camera started ${useFlash ? 'with flash' : 'without flash'}.`);
        if(wakeLockEnabled) {
          requestWakeLock();
        }

      } catch (error: any) {
        console.error("Error accessing camera:", error);
        addLog(`Camera Error: ${error.message}`);
        toast({
          variant: "destructive",
          title: "Camera Error",
          description: "Could not access the camera. Please check permissions.",
        });
        stopCamera();
      }
    }
  }, [addLog, isFlashOn, stopCamera, toast, wakeLockEnabled, requestWakeLock, model, setAppStatus]);


  const sendSortCommand = useCallback(async (classificationLabel: string) => {
    if (isTestMode) {
      addLog(`TEST MODE: Simulating command for ${classificationLabel}`);
      setCommandStatus({ status: "SUCCESS", message: `Success (Test): Sorted ${classificationLabel}` });
      toast({ title: "Command Sent (Test Mode)", description: `Sorted: ${classificationLabel}` });
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

  const runClassification = useCallback(async () => {
    if (!isCameraOn || !videoRef.current?.srcObject || !model || !streamRef.current?.active) {
      return;
    }

    const predictions = await model.predict(videoRef.current);
    setCurrentPredictions(predictions);

    const filteredPredictions = predictions.filter(
        (p) => p.className.toLowerCase() !== "background"
    );

    const localResult = interpretDetectionsLocal(
      filteredPredictions,
      CONFIDENCE_THRESHOLD
    );

    setDetectionState(localResult.detectionState);

    let topPrediction: Prediction | null = null;
    let newAppStatus: AppStatus = "AWAITING_OBJECT";
    
    if (localResult.detectionState === 'SINGLE_OBJECT' && localResult.primaryObject) {
      const foundPrediction = filteredPredictions.find(p => p.className === localResult.primaryObject);
      if (foundPrediction) {
          topPrediction = foundPrediction;
          setPrimaryPrediction(foundPrediction);
          setLastClassifications(prev => [...prev, foundPrediction]);
          newAppStatus = "READY_TO_SEND";
      } else {
        setPrimaryPrediction(null);
      }
    } else {
      setPrimaryPrediction(null);
      if (localResult.detectionState === 'AMBIGUOUS' || (localResult.detectionState === 'NO_DETECTION' && filteredPredictions.some(p => p.probability > 0.5))) {
        newAppStatus = "CONFIDENCE_TOO_LOW";
      }
    }

    if (appStatus !== 'COLLECTING_IMAGES' && appStatus !== 'COOLDOWN' && appStatus !== 'CAMERA_CYCLING') {
      setAppStatus(newAppStatus);
    }
    
    if (autoCaptureEnabled && !isCollectingImages && appStatus !== 'COOLDOWN') {
      const shouldTriggerCapture = 
        localResult.detectionState === 'AMBIGUOUS' ||
        newAppStatus === 'CONFIDENCE_TOO_LOW';
      
      if (shouldTriggerCapture) {
        if (!ambiguousDetectionTimer.current) {
          addLog(`Uncertain detection. Triggering capture in ${AUTO_CAPTURE_TRIGGER_TIME / 1000}s.`);
          ambiguousDetectionTimer.current = setTimeout(() => {
            addLog("Threshold met. Starting automatic image capture.");
            startImageCollection();
            ambiguousDetectionTimer.current = null;
          }, AUTO_CAPTURE_TRIGGER_TIME);
        }
      } else {
        if (ambiguousDetectionTimer.current) {
          addLog("Detection became clear. Cancelling auto-capture trigger.");
          clearTimeout(ambiguousDetectionTimer.current);
          ambiguousDetectionTimer.current = null;
        }
      }
    }

    
    if (topPrediction) { 
      if (predictionIntervalRef.current) {
        clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = undefined;
        addLog("Classification loop paused for command.");
      }
      
      sendSortCommand(topPrediction.className);
      
      stopCamera();
      setAppStatus("CAMERA_CYCLING");
      addLog(`Command sent. Restarting camera in ${CAMERA_RESTART_DELAY / 1000} seconds...`);
      setTimeout(() => {
        addLog("Restarting camera now.");
        startCamera();
      }, CAMERA_RESTART_DELAY);
    }
  }, [isCameraOn, model, sendSortCommand, addLog, stopCamera, startCamera, autoCaptureEnabled, isCollectingImages, appStatus, startImageCollection, setAppStatus]);


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
      startCamera(isFlashOn);
    }
  };

  const toggleFlash = () => {
    if (isCameraOn) {
      const newFlashState = !isFlashOn;
      startCamera(newFlashState);
    }
  };
  
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000);
    } else if (isCollectingImages && countdown === 0 && collectedImages.length === 0) { // Start capture only when countdown finishes
        addLog("Countdown finished. Capturing images...");
        
        const captureInterval = setInterval(() => {
            setCollectedImages(prev => {
                if (prev.length >= IMAGE_CAPTURE_COUNT -1) {
                    clearInterval(captureInterval);
                }
                if (!videoRef.current) return prev;

                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                    const dataUri = canvas.toDataURL('image/jpeg');
                    return [...prev, dataUri];
                }
                return prev;
            });
        }, IMAGE_CAPTURE_INTERVAL);

        return () => clearInterval(captureInterval);
    }
     return () => clearTimeout(timer);
  }, [countdown, isCollectingImages, addLog, collectedImages.length]);


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
}, [collectedImages, isCollectingImages, addLog, toast, autoCaptureEnabled, setAppStatus]);

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
            case "LIBS_LOADED": return "AI libs loaded";
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
        <div className="flex flex-col gap-2">
             <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getStatusBadgeVariant()} className="text-xs">
                    {isLoading && <Hourglass className="h-3 w-3 mr-1 animate-spin" />}
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

        if (appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING') {
            return <p className="text-lg text-white/90 shadow-md">Loading model...</p>;
        }
        if (!model) {
           return (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Upload className="h-16 w-16 text-muted-foreground animate-pulse" />
                  <p className="mt-2 text-muted-foreground">Please load a model from settings.</p>
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
             {isCameraOn ? renderContent() : null}
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

  const LogViewer = () => {
    return (
      <ScrollArea className="flex-1 my-4">
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
    <>
      <Card className="w-full max-w-4xl shadow-2xl bg-card/80 backdrop-blur-sm border-border/20">
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

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/50 border-2 border-border/30">
              <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                  autoPlay
              />
              {!isCameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      <CameraOff className="h-16 w-16 text-muted-foreground" />
                      <p className="mt-2 text-muted-foreground">Camera is off</p>
                  </div>
              )}
              <PredictionDisplay />
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border-2 border-dashed border-border/20 h-full w-[240px]">
                <DetectionRates />
              </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-4 items-center">
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
              <Button onClick={startImageCollection} variant="outline" size="icon" disabled={!isCameraOn || isCollectingImages}>
                <Download />
              </Button>
              <Button onClick={() => setIsConsoleOpen(true)} variant="outline" className="flex-grow sm:flex-grow-0">
                    <Terminal />
                    Console
              </Button>
            </div>
        </CardFooter>
      </Card>
      <Sheet open={isConsoleOpen} onOpenChange={setIsConsoleOpen}>
        <SheetContent side="bottom" className="h-1/2 flex flex-col">
            <SheetHeader>
                <SheetTitle>Console Logs</SheetTitle>
                <SheetDescription>
                    Real-time logs from the application.
                </SheetDescription>
            </SheetHeader>
            <Separator />
            <LogViewer />
            <SheetFooter>
                <Button variant="outline" onClick={() => setLogs([])}>Clear Logs</Button>
            </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

    