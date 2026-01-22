
"use client";

import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import type * as tmImage from "@teachablemachine/image";
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
import { Camera, CameraOff, Flashlight, FlashlightOff, AlertTriangle, Upload, Hourglass, CheckCircle, XCircle, TestTube, Download, Sparkles, Lock, Unlock, BluetoothConnected, BluetoothOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AppStatus, LogEntry, Prediction } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sendCommand as sendBluetoothCommand } from "@/lib/bluetooth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";


type CommandStatus = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
};

type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

interface SortVisionClientProps {
  model: tmImage.CustomMobileNet | null;
  appStatus: AppStatus;
  setAppStatus: (status: AppStatus) => void;
  isTestMode: boolean;
  wakeLockEnabled: boolean;
  autoCaptureEnabled: boolean;
  autoSortEnabled: boolean;
  autoFlashEnabled: boolean;
  tmImageRef: MutableRefObject<typeof tmImage | null>;
  logs: LogEntry[];
  setLogs: (logs: LogEntry[]) => void;
  addLog: (message: string) => void;
  confidenceThreshold: number;
  setConfidenceThreshold: (value: number) => void;
}


const PREDICTION_INTERVAL = 100;
const IMAGE_CAPTURE_COUNT = 20;
const IMAGE_CAPTURE_INTERVAL = 100;
const CAPTURE_COUNTDOWN_SECONDS = 3;
const AUTO_CAPTURE_TRIGGER_TIME = 2000;
const AUTO_CAPTURE_COOLDOWN_TIME = 5000;
const CAMERA_RESTART_DELAY_MS = 3000;
const CAMERA_WARMUP_DELAY = 3000;
const DETECTION_SETTLE_DELAY = 1500;

const interpretDetectionsLocal = (
  predictions: Prediction[],
  confidenceThreshold: number
): { detectionState: DetectionState, primaryObject?: string, detectedObjects?: string[], reason: string } => {
  const sortedPredictions = [...predictions].sort(
    (a, b) => b.probability - a.probability
  );

  if (!sortedPredictions.length || sortedPredictions[0].probability < 0.5) {
    return {
      detectionState: 'NO_DETECTION',
      reason: 'No object detected with sufficient confidence.',
    };
  }

  const topPrediction = sortedPredictions[0];
  const secondPrediction = sortedPredictions.length > 1 ? sortedPredictions[1] : null;

  const highConfidencePredictions = sortedPredictions.filter(
    (p) => p.probability >= confidenceThreshold
  );

  if (
    topPrediction.probability > 0.90 &&
    (!secondPrediction || topPrediction.probability > secondPrediction.probability * 2)
  ) {
    return {
      detectionState: 'SINGLE_OBJECT',
      primaryObject: topPrediction.className,
      reason: `Very high confidence for ${topPrediction.className}.`,
    };
  }

  // Split confidence check
  if (secondPrediction && (topPrediction.probability + secondPrediction.probability > 0.85) && secondPrediction.probability > 0.15) {
    return {
      detectionState: 'MULTIPLE_OBJECTS',
      detectedObjects: [topPrediction.className, secondPrediction.className],
      reason: 'Split confidence between two objects.',
    };
  }

  if (highConfidencePredictions.length > 1) {
    return {
      detectionState: 'MULTIPLE_OBJECTS',
      detectedObjects: highConfidencePredictions.map((p) => p.className),
      reason: 'Multiple objects detected above confidence threshold.',
    };
  }

  if (highConfidencePredictions.length === 1) {
    return {
      detectionState: 'SINGLE_OBJECT',
      primaryObject: highConfidencePredictions[0].className,
      reason: `One object found above threshold: ${highConfidencePredictions[0].className}.`,
    };
  }

  if (topPrediction.probability >= 0.5 && topPrediction.probability < confidenceThreshold) {
    return {
      detectionState: 'AMBIGUOUS',
      reason: `Highest confidence (${(topPrediction.probability * 100).toFixed(0)}%) is below the required ${confidenceThreshold * 100}% threshold.`,
    };
  }

  return {
    detectionState: 'NO_DETECTION',
    reason: 'Analysis complete, but no clear result based on rules.',
  };
};

export default function SortVisionClient({
  model,
  appStatus,
  setAppStatus,
  isTestMode,
  wakeLockEnabled,
  autoCaptureEnabled,
  autoSortEnabled,
  autoFlashEnabled,
  tmImageRef,
  logs,
  setLogs,
  addLog,
  confidenceThreshold,
  setConfidenceThreshold,
}: SortVisionClientProps) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isFocusLocked, setIsFocusLocked] = useState(false);
  const [isAutoScrollOn, setIsAutoScrollOn] = useState(true);
  const [detectionState, setDetectionState] = useState<DetectionState>("NO_DETECTION");
  const [primaryPrediction, setPrimaryPrediction] = useState<Prediction | null>(null);
  const [currentPredictions, setCurrentPredictions] = useState<Prediction[]>([]);
  const [isCollectingImages, setIsCollectingImages] = useState(false);
  const [collectedImages, setCollectedImages] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [commandStatus, setCommandStatus] = useState<CommandStatus>({ status: "IDLE", message: "Awaiting command." });
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isBtConnected, setIsBtConnected] = useState(false);
  const [stablePrediction, setStablePrediction] = useState<Prediction | null>(null);

  // Local state for the confidence input to allow smooth typing
  const [inputValue, setInputValue] = useState(String(Math.round(confidenceThreshold * 100)));
  const [isEditingInput, setIsEditingInput] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout>();
  const ambiguousDetectionTimer = useRef<NodeJS.Timeout | null>(null);
  const detectionTimer = useRef<NodeJS.Timeout | null>(null);
  const isPredictingRef = useRef(false);

  const { toast } = useToast();

  // Sync inputValue with confidenceThreshold when not editing
  useEffect(() => {
    if (!isEditingInput) {
      setInputValue(String(Math.round(confidenceThreshold * 100)));
    }
  }, [confidenceThreshold, isEditingInput]);

  const sendLightCommand = useCallback(async (state: 'ON' | 'OFF') => {
    if (isTestMode) {
      addLog(`TEST MODE: Simulating light ${state} command.`);
      return true;
    }
    if (!isBtConnected) {
      addLog("Cannot send light command: Bluetooth not connected.");
      return false;
    }
    try {
      await sendBluetoothCommand(`LIGHT_${state}`);
      addLog(`Sent command: LIGHT_${state}`);
      return true;
    } catch (error: any) {
      addLog(`Error sending light command: ${error.message}`);
      toast({
        variant: 'destructive',
        title: 'Bluetooth Error',
        description: 'Failed to send light command.'
      });
      return false;
    }
  }, [isTestMode, addLog, toast, isBtConnected]);


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

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock) {
      try {
        await wakeLock.release();
        setWakeLock(null);
        addLog("Screen wake lock released.");
      } catch (error: any) {
        console.error("Could not release wake lock:", error);
        addLog(`Wake Lock Error on release: ${error.message}`);
      }
    }
  }, [wakeLock, addLog]);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && wakeLockEnabled && !wakeLock) {
      try {
        addLog("Requesting screen wake lock.");
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        addLog("Screen wake lock acquired.");
        lock.addEventListener('release', () => {
          addLog("Screen wake lock released by browser.");
          setWakeLock(null);
        });
      } catch (err: any) {
        addLog(`Wake Lock Error: ${err.message}`);
        console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
      }
    }
  }, [wakeLockEnabled, wakeLock, addLog]);

  const applyCameraSettings = useCallback(async (stream: MediaStream, { flash, focus }: { flash: boolean; focus: boolean; }) => {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const capabilities = videoTrack.getCapabilities();

    if (capabilities.torch) {
      try {
        await videoTrack.applyConstraints({ advanced: [{ torch: flash }] });
        setIsFlashOn(flash);
        addLog(`Restored flash state to: ${flash ? 'ON' : 'OFF'}`);
      } catch (error: any) {
        addLog(`Could not restore flash state: ${error.message}`);
      }
    }

    // @ts-ignore
    if (capabilities.focusMode) {
      try {
        const focusMode = focus ? 'manual' : 'continuous';
        // @ts-ignore
        await videoTrack.applyConstraints({ advanced: [{ focusMode }] });
        setIsFocusLocked(focus)
        addLog(`Restored focus mode to: ${focusMode}`);
      } catch (error: any) {
        addLog(`Could not restore focus mode: ${error.message}`);
      }
    }
  }, [addLog]);

  const stopCamera = useCallback((preserveSettings = false) => {
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
    if (detectionTimer.current) {
      clearTimeout(detectionTimer.current);
      detectionTimer.current = null;
    }
    streamRef.current = null;
    setIsCameraOn(false);
    if (!preserveSettings) {
      setIsFocusLocked(false);
      setIsFlashOn(false);
    }
    setPrimaryPrediction(null);
    setCurrentPredictions([]);
    setDetectionState("NO_DETECTION");
    setStablePrediction(null);
    releaseWakeLock();
  }, [releaseWakeLock, addLog]);

  const startCamera = useCallback(async (options: { restoreFlash?: boolean, restoreFocus?: boolean } = {}) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addLog("Camera API not available in this browser.");
      toast({ variant: "destructive", title: "Unsupported Browser", description: "Camera access is not available." });
      setHasCameraPermission(false);
      return;
    }

    if (streamRef.current) {
      stopCamera(true); // Preserve settings during quick restart
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    addLog("Requesting camera access...");
    setAppStatus("CAMERA_WARMING_UP");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setHasCameraPermission(true);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play().then(async () => {
            setIsCameraOn(true);
            addLog("Camera started successfully. Warming up...");

            await applyCameraSettings(stream, {
              flash: options.restoreFlash ?? isFlashOn,
              focus: options.restoreFocus ?? isFocusLocked,
            });

            await requestWakeLock();
          }).catch((error) => {
            console.error("Video play failed:", error);
            addLog(`Video play error: ${error.message}`);
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
      setAppStatus("AWAITING_MODEL");
      toast({
        variant: "destructive",
        title: "Camera Access Denied",
        description: "Please enable camera permissions in your browser settings.",
      });
      stopCamera();
    }
  }, [addLog, setAppStatus, stopCamera, toast, requestWakeLock, isFlashOn, isFocusLocked, applyCameraSettings]);


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
    // @ts-ignore
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
      const focusMode = newFocusState ? 'manual' : 'continuous';
      addLog(`Setting focus mode to: ${focusMode}.`);
      // @ts-ignore
      await videoTrack.applyConstraints({ advanced: [{ focusMode }] });
      setIsFocusLocked(newFocusState);
      addLog(`Focus mode is now ${focusMode}.`);
      toast({ title: newFocusState ? 'Focus Locked' : 'Focus Unlocked (Autofocus)' });

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
      return true;
    }

    if (!isBtConnected) {
      addLog("Cannot send sort command: Bluetooth not connected.");
      toast({ variant: "destructive", title: "Bluetooth Error", description: "Sorter not connected." });
      return false;
    }

    try {
      await sendBluetoothCommand(classificationLabel.toUpperCase());
      setCommandStatus({ status: "SUCCESS", message: `Success: Sorted ${classificationLabel}` });
      toast({ title: "Command Sent", description: `Sorted: ${classificationLabel}` });
      return true;
    } catch (error: any) {
      addLog(`Error sending sort command: ${error.message}`);
      setCommandStatus({ status: "ERROR", message: `Error: ${error.message}` });
      toast({ variant: "destructive", title: "Bluetooth Error", description: `Could not send command.` });
      return false;
    }
  }, [addLog, toast, isTestMode, isBtConnected]);

  const handleSortAndRestart = useCallback(async (classification: string) => {
    const flashState = isFlashOn;
    const focusState = isFocusLocked;

    stopCamera(true); // Preserve UI state

    setAppStatus("CAMERA_CYCLING");

    if (flashState) {
      await sendLightCommand('OFF');
    }

    let sortSuccess = false;
    if (classification !== "RESTART_NO_SORT") {
      addLog(`Sending command for ${classification}...`);
      sortSuccess = await sendSortCommand(classification);
    } else {
      sortSuccess = true; // No sort needed, so we can proceed
    }

    if (sortSuccess) {
      addLog("Sort command acknowledged. Restarting camera.");
    } else {
      addLog("Sort command failed. Restarting camera anyway.");
    }
    setTimeout(() => startCamera({ restoreFlash: flashState, restoreFocus: focusState }), CAMERA_RESTART_DELAY_MS);

  }, [stopCamera, addLog, sendSortCommand, startCamera, setAppStatus, sendLightCommand, isFlashOn, isFocusLocked]);

  const runClassification = useCallback(async () => {
    if (isPredictingRef.current || !isCameraOn || !videoRef.current?.srcObject || !model || !streamRef.current?.active) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState < video.HAVE_ENOUGH_DATA) {
      return;
    }

    isPredictingRef.current = true;

    try {
      const predictions = await model.predict(video);
      setCurrentPredictions(predictions);

      const filteredPredictions = predictions.filter(
        (p) => p.className.toLowerCase() !== "background"
      );

      const localResult = interpretDetectionsLocal(
        filteredPredictions,
        confidenceThreshold
      );

      setDetectionState(localResult.detectionState);
      let newAppStatus: AppStatus = appStatus;

      if (localResult.detectionState === 'SINGLE_OBJECT' && localResult.primaryObject) {
        const foundPrediction = filteredPredictions.find(p => p.className === localResult.primaryObject);

        if (foundPrediction) {
          if (!stablePrediction || stablePrediction.className !== foundPrediction.className) {
            setStablePrediction(foundPrediction);
            if (detectionTimer.current) clearTimeout(detectionTimer.current);

            detectionTimer.current = setTimeout(() => {
              addLog(`Stable detection of ${foundPrediction.className}. Proceeding to sort.`);

              if (predictionIntervalRef.current) {
                clearInterval(predictionIntervalRef.current);
                predictionIntervalRef.current = undefined;
                addLog("Detection loop stopped for sorting.");
              }

              setPrimaryPrediction(foundPrediction);

              if (autoSortEnabled) {
                if (autoFlashEnabled) {
                  addLog(`Initial detection: ${foundPrediction.className}. Turning on light for final check.`);
                  sendLightCommand('ON').then(() => {
                    setTimeout(async () => {
                      if (!videoRef.current) {
                        if (isFlashOn) await sendLightCommand('OFF');
                        handleSortAndRestart("RESTART_NO_SORT");
                        return;
                      }
                      addLog("Re-classifying with light on...");
                      try {
                        const finalPredictions = await model.predict(videoRef.current);
                        const finalFiltered = finalPredictions.filter(p => p.className.toLowerCase() !== 'background');
                        const finalResult = interpretDetectionsLocal(finalFiltered, confidenceThreshold);
                        if (finalResult.detectionState === 'SINGLE_OBJECT' && finalResult.primaryObject) {
                          addLog(`Final confirmation: ${finalResult.primaryObject}. Sorting.`);
                          handleSortAndRestart(finalResult.primaryObject);
                        } else {
                          addLog(`Final check failed. Result: ${finalResult.detectionState}. Restarting camera.`);
                          handleSortAndRestart("RESTART_NO_SORT");
                        }
                      } catch (e) {
                        handleSortAndRestart("RESTART_NO_SORT");
                      }
                    }, 500);
                  });
                } else {
                  addLog(`Auto-Sort: Detected ${foundPrediction.className}. Sorting.`);
                  handleSortAndRestart(foundPrediction.className);
                }
              } else {
                setAppStatus("READY_TO_SEND");
                addLog(`Manual Sort: Detected ${foundPrediction.className}. Ready to send command.`);
              }
            }, DETECTION_SETTLE_DELAY);
          }
        }
      } else if (localResult.detectionState === 'MULTIPLE_OBJECTS') {
        // Multiple objects - just ignore and keep detecting
        if (detectionTimer.current) {
          clearTimeout(detectionTimer.current);
          detectionTimer.current = null;
        }
        if (stablePrediction) setStablePrediction(null);
        setPrimaryPrediction(null);
      } else {
        if (detectionTimer.current) {
          clearTimeout(detectionTimer.current);
          detectionTimer.current = null;
        }
        if (stablePrediction) setStablePrediction(null);
        setPrimaryPrediction(null);

        const isUncertain = localResult.detectionState === 'AMBIGUOUS' || (localResult.detectionState === 'NO_DETECTION' && filteredPredictions.some(p => p.probability > 0.5));
        const nextStatus: AppStatus = isUncertain ? "CONFIDENCE_TOO_LOW" : "AWAITING_OBJECT";

        if (appStatus !== nextStatus) {
          setAppStatus(nextStatus);
        }
      }
    } catch (err: any) {
      const msg = err.message || "";
      if (!msg.includes("stopTraining") && !msg.includes("already be working") && !msg.includes("compiled") && !msg.includes("Sequential")) {
        console.error("Prediction error:", err);
      }
    } finally {
      isPredictingRef.current = false;
    }

    // Auto-capture logic
    const needsCapture = detectionState === 'AMBIGUOUS' || (detectionState === 'NO_DETECTION' && currentPredictions.some(p => p.className.toLowerCase() !== 'background' && p.probability > 0.5));
    if (autoCaptureEnabled && needsCapture && !isCollectingImages && appStatus !== 'COOLDOWN' && appStatus !== 'CAMERA_CYCLING') {
      if (!ambiguousDetectionTimer.current) {
        addLog("Threshold met. Starting automatic training image capture.");
        ambiguousDetectionTimer.current = setTimeout(() => {
          startImageCollection();
          ambiguousDetectionTimer.current = null;
        }, AUTO_CAPTURE_TRIGGER_TIME);
      }
    } else if (!needsCapture && ambiguousDetectionTimer.current) {
      clearTimeout(ambiguousDetectionTimer.current);
      ambiguousDetectionTimer.current = null;
    }
  }, [isCameraOn, model, appStatus, autoCaptureEnabled, autoSortEnabled, isCollectingImages, addLog, setAppStatus, startImageCollection, handleSortAndRestart, sendLightCommand, autoFlashEnabled, isFlashOn, stablePrediction, confidenceThreshold, detectionState, currentPredictions]);

  useEffect(() => {
    return () => {
      if (isCameraOn) {
        stopCamera();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
      setAppStatus("AWAITING_MODEL");
    } else {
      // Check if model is loaded
      if (!model) {
        addLog("Cannot start camera: No model loaded.");
        toast({
          variant: "destructive",
          title: "Model Required",
          description: "Please load a model from settings before starting the camera.",
        });
        return;
      }

      // Check if model has a background class
      const modelLabels = model.getClassLabels();
      const hasBackground = modelLabels.some(label => label.toLowerCase() === 'background');

      if (!hasBackground) {
        addLog("Cannot start camera: Model does not have a 'background' class.");
        toast({
          variant: "destructive",
          title: "Background Class Required",
          description: "The loaded model must include a 'background' class for proper object detection.",
        });
        return;
      }

      startCamera();
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined = undefined;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isCollectingImages && countdown === 0) {
      const captureInterval = setInterval(() => {
        if (!videoRef.current) {
          clearInterval(captureInterval);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const dataUri = canvas.toDataURL('image/jpeg');
          setCollectedImages(prev => {
            const newImages = [...prev, dataUri];
            if (newImages.length >= IMAGE_CAPTURE_COUNT) {
              clearInterval(captureInterval);
            }
            return newImages;
          });
        }
      }, IMAGE_CAPTURE_INTERVAL);
      return () => clearInterval(captureInterval);
    }
    return () => clearTimeout(timer);
  }, [countdown, isCollectingImages]);


  useEffect(() => {
    if (isCollectingImages && collectedImages.length > 0 && collectedImages.length <= IMAGE_CAPTURE_COUNT) {
      addLog(`Captured image ${collectedImages.length}/${IMAGE_CAPTURE_COUNT}`);
    }
  }, [collectedImages, isCollectingImages, addLog]);


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
    if (appStatus === 'CAMERA_WARMING_UP') {
      const timer = setTimeout(() => {
        addLog("Camera warm-up complete. Starting detection.");
        setAppStatus("AWAITING_OBJECT");
      }, CAMERA_WARMUP_DELAY);
      return () => clearTimeout(timer);
    }
  }, [appStatus, addLog, setAppStatus]);

  useEffect(() => {
    const activeStates: AppStatus[] = ['AWAITING_OBJECT', 'CONFIDENCE_TOO_LOW'];
    const shouldRunLoop = isCameraOn && model && !predictionIntervalRef.current && activeStates.includes(appStatus) && !isCollectingImages;

    if (shouldRunLoop) {
      predictionIntervalRef.current = setInterval(runClassification, PREDICTION_INTERVAL);
    } else if ((!isCameraOn || !model || isCollectingImages || !activeStates.includes(appStatus)) && predictionIntervalRef.current) {
      clearInterval(predictionIntervalRef.current);
      predictionIntervalRef.current = undefined;
    }

    return () => {
      if (predictionIntervalRef.current) {
        clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = undefined;
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
    const onConnected = () => {
      addLog("Bluetooth device connected.");
      setIsBtConnected(true);
    };
    const onDisconnected = () => {
      addLog("Bluetooth device disconnected.");
      setIsBtConnected(false);
    };

    window.addEventListener('bt-connected', onConnected);
    window.addEventListener('bt-disconnected', onDisconnected);

    return () => {
      window.removeEventListener('bt-connected', onConnected);
      window.removeEventListener('bt-disconnected', onDisconnected);
    }
  }, [addLog]);

  const StatusDisplay = () => {
    const getStatusText = () => {
      switch (appStatus) {
        case "AWAITING_MODEL": return "Awaiting Model";
        case "LOADING_LIBS": return "Loading AI libs...";
        case "MODEL_LOADING": return "Loading Model...";
        case "CAMERA_WARMING_UP": return "Camera Warming Up...";
        case "AWAITING_OBJECT":
          return stablePrediction ? `Confirming ${stablePrediction.className}...` : "Awaiting Object";
        case "CONFIDENCE_TOO_LOW": return "Confidence Too Low";
        case "CAMERA_CYCLING": return "Waiting for Sorter...";
        case "COLLECTING_IMAGES": return "Collecting Images...";
        case "COOLDOWN": return "Cooldown";

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
        case "CAMERA_CYCLING":
        case "CAMERA_WARMING_UP": return "secondary";
        case "CONFIDENCE_TOO_LOW": return "destructive";

        case "AWAITING_OBJECT":
          return stablePrediction ? "default" : "outline";
        default: return "outline";
      }
    };

    const isLoading = appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || appStatus === 'CAMERA_CYCLING' || appStatus === 'COLLECTING_IMAGES' || appStatus === 'COOLDOWN' || appStatus === 'CAMERA_WARMING_UP' || (appStatus === 'AWAITING_OBJECT' && !!stablePrediction);

    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={getStatusBadgeVariant()} className="text-xs">
            {isLoading && <Hourglass className="h-3 w-3 mr-1 animate-spin" />}
            {appStatus === 'ANALYZING_MATERIAL' && <Sparkles className="h-3 w-3 mr-1 animate-pulse" />}
            {getStatusText()}
          </Badge>
          <Badge variant={isTestMode ? "default" : isBtConnected ? "default" : "destructive"} className="gap-2 text-xs">
            {isTestMode ? <TestTube className="h-3 w-3" /> : isBtConnected ? <BluetoothConnected className="h-3 w-3" /> : <BluetoothOff className="h-3 w-3" />}
            {isTestMode ? "Test Mode" : isBtConnected ? "Sorter Connected" : "Sorter Disconnected"}
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

      if (appStatus === 'CAMERA_WARMING_UP') {
        return (
          <div className="flex items-center gap-2">
            <Hourglass className="h-6 w-6 text-white animate-spin" />
            <h3 className="text-xl font-bold text-white drop-shadow-lg">
              Warming up...
            </h3>
          </div>
        );
      }

      if (isCollectingImages) {
        return (
          <div className="w-full max-w-xs text-center">
            <p className="text-lg text-white/90 shadow-md mb-2">Capturing...</p>
            <Progress value={(collectedImages.length / IMAGE_CAPTURE_COUNT) * 100} className="h-2 w-full bg-white/30" />
          </div>
        );
      }

      if (appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || (!model && appStatus !== "AWAITING_OBJECT")) {
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
          } else if (stablePrediction) {
            return (
              <div className="flex items-center gap-2">
                <Hourglass className="h-6 w-6 text-white animate-spin" />
                <h3 className="text-xl font-bold text-white drop-shadow-lg">
                  Confirming {stablePrediction.className}...
                </h3>
              </div>
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
      <div className={cn("absolute inset-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex flex-col items-center", isCollectingImages || countdown > 0 || appStatus === 'CAMERA_WARMING_UP' ? "justify-center" : "justify-start")}>
        {renderContent()}
      </div>
    );
  };

  const DetectionRates = () => {
    const getProbability = (label: string) => {
      const prediction = currentPredictions.find(p => p.className === label);
      return prediction ? prediction.probability : 0;
    };
    const modelLabels = model?.getClassLabels() ?? [];

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

  const isCameraControlDisabled = isCollectingImages;

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

        {autoSortEnabled && (
          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border/50">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Confidence Threshold</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[confidenceThreshold]}
                  onValueChange={(vals) => setConfidenceThreshold(vals[0])}
                  max={1}
                  min={0.5}
                  step={0.01}
                  className="w-[120px]"
                />
                <div className="relative flex items-center">
                  <Input
                    type="text"
                    value={inputValue}
                    onFocus={() => setIsEditingInput(true)}
                    onBlur={() => {
                      setIsEditingInput(false);
                      setInputValue(String(Math.round(confidenceThreshold * 100)));
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInputValue(val);
                      if (val === '') return;
                      const numVal = parseInt(val);
                      if (!isNaN(numVal)) {
                        const clamped = Math.min(Math.max(numVal, 1), 100);
                        setConfidenceThreshold(clamped / 100);
                      }
                    }}
                    className="h-7 w-14 px-1 text-center text-xs font-bold text-primary border-primary/20 bg-background/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-1 pointer-events-none text-[10px] text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <StatusDisplay />
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center">
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
        <Accordion type="single" collapsible>
          <AccordionItem value="console" className="border-b-0">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">Console</AccordionTrigger>
            <AccordionContent className="flex flex-col">
              <LogViewer logs={logs} isAutoScrollOn={isAutoScrollOn} />
              <div className="flex items-center justify-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch id="auto-scroll" checked={isAutoScrollOn} onCheckedChange={setIsAutoScrollOn} />
                  <Label htmlFor="auto-scroll" className="text-xs">Auto-scroll</Label>
                </div>
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
        <TooltipProvider>
          <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
            <Button onClick={toggleCamera} variant="outline" className="flex-grow sm:flex-grow-0" disabled={appStatus === 'LOADING_LIBS' || isCollectingImages}>
              {isCameraOn ? <CameraOff /> : <Camera />}
              {isCameraOn ? "Stop" : "Start"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={toggleFlash} variant="outline" size="icon" disabled={!isCameraOn || isCameraControlDisabled} aria-label="Toggle Flash">
                  {isFlashOn ? <FlashlightOff /> : <Flashlight />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle Flash</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={toggleFocus} variant="outline" size="icon" disabled={!isCameraOn || isCameraControlDisabled} aria-label="Toggle Focus Lock">
                  {isFocusLocked ? <Unlock /> : <Lock />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFocusLocked ? 'Unlock Focus' : 'Lock Focus'}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={startImageCollection} variant="outline" size="icon" disabled={!isCameraOn || !model || isCollectingImages} aria-label="Download Training Images">
                  <Download />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Capture training images</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}

function LogViewer({ logs, isAutoScrollOn }: { logs: LogEntry[]; isAutoScrollOn: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAutoScrollOn && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isAutoScrollOn]);

  return (
    <div
      ref={scrollRef}
      className="w-full my-4 bg-muted/20 rounded-md border h-[200px] overflow-y-auto p-4 font-mono text-xs"
    >
      {logs.map((log) => (
        <p key={log.id}>
          <span className="text-muted-foreground/50">{log.timestamp}</span>
          <span className="ml-2 text-foreground">{log.message}</span>
        </p>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
