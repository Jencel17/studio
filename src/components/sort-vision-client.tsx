
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
import { Camera, CameraOff, Smartphone, Terminal, Flashlight, FlashlightOff, AlertTriangle, Upload, FileUp, Hourglass, Wifi, CheckCircle, XCircle, TestTube, Download, Save, Trash2, Loader2, BrainCircuit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { type InterpretDetectionsOutput } from "@/app/actions/ai-schemas";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger, SidebarGroup, SidebarGroupLabel, SidebarFooter, SidebarClose } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { saveModelToDb, getModelsFromDb, deleteModelFromDb, getModelFromDb, type StoredModel } from "@/lib/model-db";


type Prediction = {
  className: string;
  probability: number;
};

type LogEntry = {
  timestamp: string;
  message: string;
};

type AppStatus = "AWAITING_MODEL" | "LOADING_LIBS" | "LIBS_LOADED"| "MODEL_LOADING" | "AWAITING_OBJECT" | "CONFIDENCE_TOO_LOW" | "READY_TO_SEND" | "CAMERA_CYCLING" | "COLLECTING_IMAGES";

type CommandStatus = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
};

type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

// Dynamically import AI libraries
type TeachableMachine = typeof import("@teachablemachine/image");
type TensorFlow = typeof import("@tensorflow/tfjs");


const CAMERA_RESTART_DELAY = 3000;
const CONFIDENCE_THRESHOLD = 0.8;
const MAX_LOGS = 100;
const PREDICTION_INTERVAL = 100;
const IMAGE_CAPTURE_COUNT = 20;
const IMAGE_CAPTURE_INTERVAL = 100;
const CAPTURE_COUNTDOWN_SECONDS = 3;


// Local implementation of the AI logic to avoid network latency
const interpretDetectionsLocal = (
  predictions: Prediction[],
  confidenceThreshold: number
): InterpretDetectionsOutput => {
  const significantPredictions = predictions.filter(
    (p) => p.probability >= confidenceThreshold
  );

  if (significantPredictions.length === 0) {
    return {
      detectionState: "NO_DETECTION",
      reason: "No prediction meets the confidence threshold.",
    };
  }

  if (significantPredictions.length === 1) {
    const topPrediction = significantPredictions[0];
    const secondPrediction = predictions.sort((a,b) => b.probability - a.probability)[1];
    if (secondPrediction && topPrediction.probability > secondPrediction.probability * 2) {
      return {
        detectionState: "SINGLE_OBJECT",
        primaryObject: topPrediction.className,
        reason: `Single object detected with high confidence: ${topPrediction.className}.`,
      };
    }
  }

  if (significantPredictions.length > 1) {
    return {
      detectionState: "MULTIPLE_OBJECTS",
      detectedObjects: significantPredictions.map((p) => p.className),
      reason: "Multiple objects detected above confidence threshold.",
    };
  }

  // If one is above, but others are close, it's ambiguous.
  return {
    detectionState: "AMBIGUOUS",
    reason: "Predictions are ambiguous, with no single clear object.",
  };
};

export default function SortVisionClient() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [modelLabels, setModelLabels] = useState<string[]>([]);
  const [detectionState, setDetectionState] = useState<DetectionState>("NO_DETECTION");
  const [primaryPrediction, setPrimaryPrediction] = useState<Prediction | null>(null);
  const [currentPredictions, setCurrentPredictions] = useState<Prediction[]>([]);

  // Image capture state
  const [isCollectingImages, setIsCollectingImages] = useState(false);
  const [collectedImages, setCollectedImages] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(0);

  // Model Library State
  const [savedModels, setSavedModels] = useState<StoredModel[]>([]);
  const [newModelName, setNewModelName] = useState("");
  const [modelFiles, setModelFiles] = useState<{ model: File; metadata: File; weights: File } | null>(null);

  // AI library state
  const tmImageRef = useRef<TeachableMachine | null>(null);
  const tfRef = useRef<TensorFlow | null>(null);
  
  // New state for HTTP communication
  const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
  const [commandStatus, setCommandStatus] = useState<CommandStatus>({ status: "IDLE", message: "Awaiting command." });
  const [esp32Ip, setEsp32Ip] = useState("http://192.168.4.1");
  const [isTestMode, setIsTestMode] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout>();
  const countdownIntervalRef = useRef<NodeJS.Timeout>();

  const { toast } = useToast();
  
  const addLog = useCallback((message: string) => {
    const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        message,
    };
    setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, MAX_LOGS));
  }, []);

  const loadAiLibraries = useCallback(async () => {
    if (tmImageRef.current && tfRef.current) {
      addLog("AI libraries already loaded.");
      return true;
    }
    setAppStatus("LOADING_LIBS");
    addLog("Loading AI libraries (TensorFlow & Teachable Machine)...");
    try {
      const [tm, tf] = await Promise.all([
        import("@teachablemachine/image"),
        import("@tensorflow/tfjs"),
      ]);
      tmImageRef.current = tm;
      tfRef.current = tf;
      addLog("AI libraries loaded successfully.");
      setAppStatus("AWAITING_MODEL");
      return true;
    } catch (error: any) {
      console.error("Failed to load AI libraries:", error);
      addLog(`FATAL: Could not load AI libraries. ${error.message}`);
      toast({
        variant: "destructive",
        title: "Library Load Error",
        description: "Could not load core AI libraries. Please refresh the page.",
      });
      setAppStatus("AWAITING_MODEL");
      return false;
    }
  }, [addLog, toast]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsWakeLockActive(false);
        addLog("Screen wake lock released.");
      } catch (error: any) {
        console.error("Could not release wake lock:", error);
        addLog(`Error releasing wake lock: ${error.message}`);
      }
    }
  }, [addLog]);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && wakeLockEnabled && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setIsWakeLockActive(true);
        addLog("Screen wake lock acquired.");
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
          setIsWakeLockActive(false);
          addLog("Wake Lock was released by the system.");
        });
      } catch (err: any) {
        console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
        addLog(`Wake Lock Error: ${err.message}`);
        setIsWakeLockActive(false);
      }
    }
  }, [wakeLockEnabled, addLog]);

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
  }, [releaseWakeLock, addLog, model, appStatus]);

  const startCamera = useCallback(async (flashEnabled?: boolean) => {
    if (!(await loadAiLibraries())) return;

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
  }, [addLog, isFlashOn, stopCamera, toast, wakeLockEnabled, requestWakeLock, model, loadAiLibraries]);


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
    
    if (localResult.detectionState === 'SINGLE_OBJECT' && localResult.primaryObject) {
      const foundPrediction = filteredPredictions.find(p => p.className === localResult.primaryObject);
      if (foundPrediction) {
          topPrediction = foundPrediction;
          setPrimaryPrediction(foundPrediction);
          setLastClassifications(prev => [...prev, foundPrediction]);
      } else {
        setPrimaryPrediction(null);
      }
    } else {
      setPrimaryPrediction(null);
    }
    
    if (topPrediction) { 
      setAppStatus("READY_TO_SEND");
      
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

    } else if (filteredPredictions.some(p => p.probability > 0.5)) {
        setAppStatus("CONFIDENCE_TOO_LOW");
    } else {
        setAppStatus("AWAITING_OBJECT");
    }

  }, [isCameraOn, model, sendSortCommand, addLog, stopCamera, startCamera]);

  const loadModelFromFiles = useCallback(async (modelFile: File, metadataFile: File, weightsFile: File) => {
    if (!(await loadAiLibraries())) return;

    setIsModelLoading(true);
    setAppStatus("MODEL_LOADING");
    addLog("Loading Teachable Machine model from files...");
    
    const tmImage = tmImageRef.current;
    const tf = tfRef.current;

    if (!tmImage || !tf) {
        addLog("Error: AI libraries not available for model loading.");
        toast({ variant: "destructive", title: "Load Error", description: "AI Libraries not found." });
        setIsModelLoading(false);
        return;
    }

    try {
      addLog("Setting TensorFlow backend to 'cpu'.");
      await tf.setBackend('cpu');
      await tf.ready();
      addLog("TensorFlow is ready.");
      
      addLog("Starting model load from files.");
      const loadedModel = await tmImage.loadFromFiles(modelFile, weightsFile, metadataFile);
      addLog("Model files loaded into memory.");
      
      const labels = loadedModel.getClassLabels();
      
      if (!labels.some(label => label.toLowerCase() === 'background')) {
        addLog("Error: Model does not contain a 'background' category. Model rejected.");
        toast({
          variant: "destructive",
          title: "Invalid Model: Missing 'background' category",
          description: "The loaded model must include a class named 'background' to work correctly. Please train and export a new model.",
          duration: 9000,
        });
        setModel(null);
        setModelLabels([]);
        setAppStatus("AWAITING_MODEL");
      } else {
        setModel(loadedModel);
        setModelLabels(labels);
        setModelFiles({ model: modelFile, metadata: metadataFile, weights: weightsFile });
        setNewModelName(modelFile.name.replace('.json', ''));
        addLog(`Model loaded successfully. Classes: ${labels.join(', ')}`);
        toast({ title: "Model Loaded", description: "Teachable Machine model is ready." });
        setAppStatus("AWAITING_OBJECT");
      }
      
    } catch (error: any) {
        console.error("Model loading error:", error);
        addLog(`Model loading failed: ${error.message}`);
        toast({ variant: "destructive", title: "Model Load Error", description: "Could not load the model. Check console for details." });
        setModel(null);
        setModelLabels([]);
        setAppStatus("AWAITING_MODEL");
    } finally {
        setIsModelLoading(false);
        addLog("Model loading process finished.");
    }
  }, [addLog, toast, loadAiLibraries]);

  const handleFileDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    addLog("Files dropped.");

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
      addLog("No files found in drop event.");
      return;
    }

    if (files.length === 1 && files[0].name.endsWith('.zip')) {
        const file = files[0];
        addLog(`Zip file detected: ${file.name}. Unpacking...`);
        try {
            const zip = await JSZip.loadAsync(file);
            const modelJsonFile = zip.file("model.json");
            const weightsBinFile = zip.file("weights.bin");
            const metadataJsonFile = zip.file("metadata.json");

            if (!modelJsonFile || !metadataJsonFile || !weightsBinFile) {
                throw new Error("model.json, weights.bin, or metadata.json not found in the zip file.");
            }

            const modelBlob = await modelJsonFile.async("blob");
            const weightsBlob = await weightsBinFile.async("blob");
            const metadataBlob = await metadataJsonFile.async("blob");

            const modelFile = new File([modelBlob], "model.json", { type: "application/json" });
            const weightsFile = new File([weightsBlob], "weights.bin", { type: "application/octet-stream" });
            const metadataFile = new File([metadataBlob], "metadata.json", { type: "application/json" });
            
            await loadModelFromFiles(modelFile, metadataFile, weightsFile);

        } catch (error: any) {
            console.error("Zip file processing error:", error);
            addLog(`Error processing zip file: ${error.message}`);
            toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file. Ensure it's a valid Teachable Machine export." });
        }
    } else {
        let droppedModelFile: File | null = null;
        let droppedMetadataFile: File | null = null;
        let droppedWeightsFile: File | null = null;

        Array.from(files).forEach(file => {
            if (file.name === 'model.json') {
                droppedModelFile = file;
                addLog('model.json found.');
            } else if (file.name === 'metadata.json') {
                droppedMetadataFile = file;
                addLog('metadata.json found.');
            } else if (file.name === 'weights.bin') {
                droppedWeightsFile = file;
                addLog('weights.bin found.');
            }
        });

        if (droppedModelFile && droppedMetadataFile && droppedWeightsFile) {
             addLog('All model components found. Loading model.');
             await loadModelFromFiles(droppedModelFile, droppedMetadataFile, droppedWeightsFile);
        } else {
             addLog("Dropped files are not a valid model. Please drop a .zip file or model.json, metadata.json and weights.bin together.");
             toast({ variant: "destructive", title: "Invalid Files", description: "Please drop a .zip file or all three model component files." });
        }
    }
  }, [addLog, toast, loadModelFromFiles]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1 && files[0].name.endsWith('.zip')) {
      const file = files[0];
      addLog(`Zip file selected: ${file.name}. Unpacking...`);
      try {
        const zip = await JSZip.loadAsync(file);
        const modelJsonFile = zip.file("model.json");
        const weightsBinFile = zip.file("weights.bin");
        const metadataJsonFile = zip.file("metadata.json");

        if (!modelJsonFile || !metadataJsonFile || !weightsBinFile) {
          throw new Error("model.json, weights.bin, or metadata.json not found in the zip file.");
        }

        const modelBlob = await modelJsonFile.async("blob");
        const weightsBlob = await weightsBinFile.async("blob");
        const metadataBlob = await metadataJsonFile.async("blob");

        const modelFile = new File([modelBlob], "model.json", { type: "application/json" });
        const weightsFile = new File([weightsBlob], "weights.bin", { type: "application/octet-stream" });
        const metadataFile = new File([metadataBlob], "metadata.json", { type: "application/json" });
        
        await loadModelFromFiles(modelFile, metadataFile, weightsFile);
      } catch (error: any) {
        console.error("Zip file processing error:", error);
        addLog(`Error processing zip file: ${error.message}`);
        toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file." });
      }
    } else {
       let selectedModelFile: File | null = null;
       let selectedMetadataFile: File | null = null;
       let selectedWeightsFile: File | null = null;

       Array.from(files).forEach(file => {
         if (file.name === 'model.json') {
           selectedModelFile = file;
         } else if (file.name === 'metadata.json') {
           selectedMetadataFile = file;
         } else if (file.name === 'weights.bin') {
            selectedWeightsFile = file;
         }
       });

       if (selectedModelFile && selectedMetadataFile && selectedWeightsFile) {
         addLog('All model components selected. Loading model.');
         await loadModelFromFiles(selectedModelFile, selectedMetadataFile, selectedWeightsFile);
       } else {
         addLog("Invalid file selection. Please select a .zip file, or model.json, metadata.json and weights.bin.");
         toast({ variant: "destructive", title: "Invalid Files", description: "Select a .zip or all three model component files." });
       }
    }
    // Reset file input so the same file can be selected again
    event.target.value = '';
  };


  useEffect(() => {
    loadAiLibraries();
  }, [loadAiLibraries]);

  const refreshModelsFromDb = useCallback(async () => {
    addLog("Refreshing model list from local DB...");
    const models = await getModelsFromDb();
    setSavedModels(models);
    addLog(`Found ${models.length} saved models.`);
  }, [addLog]);

  useEffect(() => {
    refreshModelsFromDb();
  }, [refreshModelsFromDb]);
  
  const handleSaveModel = async () => {
    if (!modelFiles || !newModelName) {
      toast({ variant: "destructive", title: "Cannot Save", description: "No model is loaded or name is empty." });
      return;
    }
    try {
      addLog(`Saving model "${newModelName}" to local library...`);
      await saveModelToDb(newModelName, modelFiles.model, modelFiles.metadata, modelFiles.weights);
      toast({ title: "Model Saved", description: `"${newModelName}" has been saved to your library.` });
      setNewModelName("");
      setModelFiles(null);
      await refreshModelsFromDb();
    } catch (error: any) {
      console.error("Failed to save model:", error);
      addLog(`Error saving model: ${error.message}`);
      toast({ variant: "destructive", title: "Save Error", description: "Could not save the model to the local library." });
    }
  };

  const handleLoadFromLibrary = async (name: string) => {
    try {
      addLog(`Loading model "${name}" from library...`);
      const modelData = await getModelFromDb(name);
      if (modelData) {
        await loadModelFromFiles(modelData.model, modelData.metadata, modelData.weights);
      } else {
        throw new Error("Model not found in the database.");
      }
    } catch (error: any) {
      console.error("Failed to load model from library:", error);
      addLog(`Error loading model: ${error.message}`);
      toast({ variant: "destructive", title: "Load Error", description: `Could not load "${name}" from the library.` });
    }
  };

  const handleDeleteFromLibrary = async (name: string) => {
    try {
      addLog(`Deleting model "${name}" from library...`);
      await deleteModelFromDb(name);
      toast({ title: "Model Deleted", description: `"${name}" has been removed from your library.` });
      await refreshModelsFromDb();
    } catch (error: any) {
      console.error("Failed to delete model from library:", error);
      addLog(`Error deleting model: ${error.message}`);
      toast({ variant: "destructive", title: "Delete Error", description: `Could not delete "${name}" from the library.` });
    }
  };

  const handleWakeLockToggle = (checked: boolean) => {
    setWakeLockEnabled(checked);
    if (checked) {
      requestWakeLock();
      toast({ title: 'Screen lock enabled', description: 'Your screen will try to stay awake.' });
    } else {
      releaseWakeLock();
      toast({ title: 'Screen lock disabled', description: 'Your screen will now turn off normally.' });
    }
  };

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

    countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
            if (prev <= 1) {
                clearInterval(countdownIntervalRef.current);
                return 0;
            }
            return prev - 1;
        });
    }, 1000);
  }, [isCameraOn, isCollectingImages, addLog]);

  useEffect(() => {
    if (countdown === 0 && isCollectingImages && collectedImages.length === 0) {
      addLog("Countdown finished. Capturing images...");
      
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
          setCollectedImages(prev => [...prev, dataUri]);
        }
      }, IMAGE_CAPTURE_INTERVAL);

      setTimeout(() => {
        clearInterval(captureInterval);
      }, IMAGE_CAPTURE_INTERVAL * IMAGE_CAPTURE_COUNT);
    }
  }, [countdown, isCollectingImages, collectedImages.length, addLog]);

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
            setAppStatus("AWAITING_OBJECT");
        }
    };
    
    if (isCollectingImages && collectedImages.length >= IMAGE_CAPTURE_COUNT) {
        zipAndDownloadImages();
    }
}, [collectedImages, isCollectingImages, addLog, toast]);

  useEffect(() => {
    if (isCameraOn && model && !predictionIntervalRef.current && !isCollectingImages) {
        addLog("Starting classification loop.");
        predictionIntervalRef.current = setInterval(runClassification, PREDICTION_INTERVAL);
    } else if ((!isCameraOn || !model || isCollectingImages) && predictionIntervalRef.current) {
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
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }
    };
  }, [isCameraOn, model, runClassification, addLog, isCollectingImages]);
  
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
        
        addLog(`Avg scores: ${JSON.stringify(averageConfidenceScores)}`);
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
  
   useEffect(() => {
    return () => {
      if(isCameraOn) {
        stopCamera();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const StatusDisplay = () => {
    const getStatusText = () => {
        switch (appStatus) {
            case "AWAITING_MODEL": return "Awaiting Model";
            case "LOADING_LIBS": return "Loading AI libs...";
            case "LIBS_LOADED": return "AI libs loaded";
            case "MODEL_LOADING": return "Loading Model...";
            case "AWAITING_OBJECT": return "Awaiting Object";
            case "CONFIDENCE_TOO_LOW": return "Confidence Too Low";
            case "CAMERA_CYCLING": return "CAMERA RESTARTING...";
            case "COLLECTING_IMAGES": return "Collecting Images...";
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
            case "LOADING_LIBS":
            case "MODEL_LOADING":
            case "CAMERA_CYCLING": return "secondary";
            case "CONFIDENCE_TOO_LOW": return "destructive";
            default: return "outline";
        }
    };

    const isLoading = appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || appStatus === 'CAMERA_CYCLING' || appStatus === 'COLLECTING_IMAGES';

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
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
            return <p className="text-lg text-white/90 shadow-md">Camera is off</p>;
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
            return <p className="text-lg text-white/90 shadow-md">Awaiting model...</p>;
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
      <Sidebar>
        <SidebarHeader>
            <div className="flex items-center justify-between p-2">
              <h2 className="text-lg font-semibold">Settings</h2>
              <SidebarClose />
            </div>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <SidebarGroup>
            <SidebarGroupLabel>Teachable Machine Model</SidebarGroupLabel>
            <div 
              onDrop={handleFileDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "m-4 mt-0 p-4 border-2 border-dashed rounded-lg text-center transition-colors duration-200",
                isDragging ? "border-primary bg-primary/10" : "border-border",
                isModelLoading && "pointer-events-none opacity-50"
              )}
            >
              <FileUp className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {isModelLoading 
                  ? "Loading model..." 
                  : isDragging 
                  ? "Release to upload" 
                  : "Drag & drop a .zip or model files"}
              </p>
              <p className="text-xs text-muted-foreground/80">or</p>
              <Button 
                variant="link" 
                className="p-0 h-auto text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isModelLoading}
              >
                click to browse
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".zip,model.json,metadata.json,application/octet-stream"
                multiple
                onChange={handleFileSelect}
                disabled={isModelLoading}
              />
            </div>
             {modelFiles && (
              <div className="mx-4 mb-4 p-4 border rounded-lg bg-muted/30 space-y-3">
                  <Label htmlFor="model-name">Save to Library</Label>
                  <div className="flex gap-2">
                      <Input 
                          id="model-name"
                          value={newModelName}
                          onChange={(e) => setNewModelName(e.target.value)}
                          placeholder="Enter model name..."
                      />
                      <Button onClick={handleSaveModel} size="icon">
                          <Save />
                      </Button>
                  </div>
              </div>
            )}
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Model Library</SidebarGroupLabel>
            <div className="p-4 pt-0">
              {savedModels.length > 0 ? (
                <div className="space-y-2">
                  {savedModels.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleLoadFromLibrary(m.name)} disabled={isModelLoading}>
                          {isModelLoading ? <Loader2 className="animate-spin"/> : <BrainCircuit />}
                        </Button>
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteFromLibrary(m.name)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center p-4">No models saved locally.</p>
              )}
            </div>
          </SidebarGroup>
           <SidebarGroup>
            <SidebarGroupLabel>Network Settings</SidebarGroupLabel>
            <div className="space-y-2 p-4">
              <Label htmlFor="esp32-ip">ESP32 IP Address</Label>
              <Input
                id="esp32-ip"
                value={esp32Ip}
                onChange={(e) => setEsp32Ip(e.target.value)}
                placeholder="e.g., http://192.168.4.1"
                disabled={isTestMode}
              />
            </div>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Device Settings</SidebarGroupLabel>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="keep-awake" className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Keep Screen Awake
                </Label>
                <Switch
                  id="keep-awake"
                  checked={wakeLockEnabled}
                  onCheckedChange={handleWakeLockToggle}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="test-mode" className="flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  Test Mode
                </Label>
                <Switch
                  id="test-mode"
                  checked={isTestMode}
                  onCheckedChange={setIsTestMode}
                />
              </div>
            </div>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <ThemeToggle />
        </SidebarFooter>
      </Sidebar>
      <Card className="w-full max-w-4xl shadow-2xl bg-card/80 backdrop-blur-sm border-border/20 relative">
        <div className="absolute top-4 left-4 z-10">
          <SidebarTrigger />
        </div>
        <CardHeader className="flex-row items-start justify-between text-center">
          <div className="w-full">
            <CardTitle className="text-2xl font-bold">SortVision</CardTitle>
            <CardDescription>AI-Powered Waste Classification</CardDescription>
          </div>
           <div className="absolute top-4 right-4 flex items-center gap-2 pt-1">
              <StatusDisplay />
          </div>
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
              {isCameraOn && !model && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      <Upload className="h-16 w-16 text-muted-foreground animate-pulse" />
                      <p className="mt-2 text-muted-foreground">Please load a model from settings.</p>
                  </div>
              )}
              <PredictionDisplay />
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border-2 border-dashed border-border/20 h-full w-[240px]">
                <DetectionRates />
              </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-2 items-center">
            <p className="text-xs text-muted-foreground">Press <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">⌘</kbd> <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">B</kbd> to toggle sidebar.</p>
            <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
              <Button onClick={toggleCamera} variant="outline" className="flex-grow sm:flex-grow-0" disabled={!model || isCollectingImages}>
                {isCameraOn ? <CameraOff /> : <Camera />}
                {isCameraOn ? "Stop Camera" : "Start Camera"}
              </Button>
               <Button onClick={toggleFlash} variant="outline" size="icon" disabled={!isCameraOn || isCollectingImages}>
                {isFlashOn ? <FlashlightOff /> : <Flashlight />}
              </Button>
              <Button onClick={startImageCollection} variant="outline" size="icon" disabled={!isCameraOn || isCollectingImages}>
                <Download />
              </Button>
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <Button onClick={() => setIsConsoleOpen(true)} variant="outline" className="w-full">
                    <Terminal />
                    Console
                  </Button>
              </div>
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
