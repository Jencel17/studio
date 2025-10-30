

"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import type { MqttClient, IClientOptions } from "mqtt";
import mqtt from "mqtt";
import * as tmImage from "@teachablemachine/image";
import * as tf from "@tensorflow/tfjs";
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
import { Camera, CameraOff, Wifi, WifiOff, PowerOff, Smartphone, Terminal, Flashlight, FlashlightOff, AlertTriangle, Upload, FileUp } from "lucide-react";
import { MetalIcon, PaperIcon, PlasticIcon } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger, SidebarGroup, SidebarGroupLabel, SidebarInput, SidebarFooter, SidebarClose } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Prediction = {
  label: "Plastic" | "Metal" | "Paper" | string;
  confidence: number;
};

type BoundingBox = [number, number, number, number]; // [x, y, width, height]

type DetectedObject = {
  id: number;
  label: Prediction['label'];
  confidence: number;
  bbox: BoundingBox;
  rotation: number; // For tilt effect
};

type MqttStatus = "Connected" | "Disconnected" | "Connecting" | "Error";

type LogEntry = {
  timestamp: string;
  message: string;
};

const CONFIDENCE_THRESHOLD = 0.8;
const CLASSIFICATION_INTERVAL = 2000;
const MODEL_SWAP_CHECK_THRESHOLD = 20;
const INACTIVITY_TIMEOUT = 60000; // 1 minute
const MAX_LOGS = 100;

export default function SortVisionClient() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("Disconnected");
  const [isHibernating, setIsHibernating] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // MQTT Settings
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState("wss://broker.hivemq.com:8884/mqtt");
  const [mqttTopic, setMqttTopic] = useState("trash/classification");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  
  const addLog = useCallback((message: string) => {
    const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        message,
    };
    setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, MAX_LOGS));
  }, []);

  const loadModel = useCallback(async (modelFile: File | Blob, metadataFile: File | Blob) => {
    setIsModelLoading(true);
    addLog("Loading Teachable Machine model...");
    try {
      const modelURL = URL.createObjectURL(modelFile);
      const metadataURL = URL.createObjectURL(metadataFile);

      await tf.setBackend('cpu');
      await tf.ready();

      const loadedModel = await tmImage.load(modelURL, metadataURL);
      setModel(loadedModel);
      
      addLog(`Model loaded successfully. Classes: ${loadedModel.getClassLabels().join(', ')}`);
      toast({ title: "Model Loaded", description: "Teachable Machine model is ready." });

    } catch (error: any) {
        console.error("Model loading error:", error);
        addLog(`Model loading failed: ${error.message}`);
        toast({ variant: "destructive", title: "Model Load Error", description: "Could not load the model. Check console for details." });
        setModel(null);
    } finally {
        setIsModelLoading(false);
    }
  }, [addLog, toast]);

  const handleFileDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    addLog("File dropped.");

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      addLog("No file found in drop event.");
      return;
    }
    
    if (file.name.endsWith('.zip')) {
        addLog(`Zip file detected: ${file.name}. Unpacking...`);
        try {
            const zip = await JSZip.loadAsync(file);
            const modelFile = zip.file("model.json");
            const metadataFile = zip.file("metadata.json");

            if (!modelFile || !metadataFile) {
                throw new Error("model.json or metadata.json not found in the zip file.");
            }

            const modelBlob = await modelFile.async("blob");
            const metadataBlob = await metadataFile.async("blob");
            
            await loadModel(modelBlob, metadataBlob);

        } catch (error: any) {
            console.error("Zip file processing error:", error);
            addLog(`Error processing zip file: ${error.message}`);
            toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file. Ensure it's a valid Teachable Machine export." });
        }
    } else {
        addLog("Dropped file is not a zip file. Please use the file picker for individual files.");
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please drop a .zip file exported from Teachable Machine." });
    }
  }, [addLog, toast, loadModel]);

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
    const file = event.target.files?.[0];
     if (!file) return;

    if (file.name.endsWith('.zip')) {
      addLog(`Zip file selected: ${file.name}. Unpacking...`);
      try {
        const zip = await JSZip.loadAsync(file);
        const modelFile = zip.file("model.json");
        const metadataFile = zip.file("metadata.json");

        if (!modelFile || !metadataFile) {
          throw new Error("model.json or metadata.json not found in the zip file.");
        }

        const modelBlob = await modelFile.async("blob");
        const metadataBlob = await metadataFile.async("blob");

        await loadModel(modelBlob, metadataBlob);
      } catch (error: any) {
        console.error("Zip file processing error:", error);
        addLog(`Error processing zip file: ${error.message}`);
        toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file." });
      }
    } else {
      addLog("Invalid file type selected. Please select a .zip file.");
      toast({ variant: "destructive", title: "Invalid File Type", description: "Please select a .zip file." });
    }
     // Reset file input to allow selecting the same file again
    event.target.value = '';
  };


  // Load MQTT settings from localStorage on initial render
  useEffect(() => {
    const savedBrokerUrl = localStorage.getItem("mqttBrokerUrl");
    const savedMqttTopic = localStorage.getItem("mqttTopic");
    if (savedBrokerUrl) setMqttBrokerUrl(savedBrokerUrl);
    if (savedMqttTopic) setMqttTopic(savedMqttTopic);
    addLog("App initialized.");
  }, [addLog]);
  
  // Save MQTT settings to localStorage whenever they change
  const handleMqttBrokerUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setMqttBrokerUrl(newUrl);
    localStorage.setItem("mqttBrokerUrl", newUrl);
  };

  const handleMqttTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTopic = e.target.value;
    setMqttTopic(newTopic);
    localStorage.setItem("mqttTopic", newTopic);
  };

  const connectToMqtt = useCallback(() => {
    function proceedWithConnection() {
        if (mqttClientRef.current && mqttClientRef.current.connected) return;

        // Disconnect previous client if it exists and is not the same
        if (mqttClientRef.current) {
            mqttClientRef.current.end(true);
            mqttClientRef.current = null;
        }

        setMqttStatus("Connecting");
        addLog(`Connecting to MQTT broker at ${mqttBrokerUrl}...`);
        try {
            const options: IClientOptions = {
                clientId: `sortvision_web_${Math.random().toString(16).substr(2, 8)}`,
                reconnectPeriod: 5000,
                connectTimeout: 60000,
            };
            const client = mqtt.connect(mqttBrokerUrl, options);
            mqttClientRef.current = client;

            client.on("connect", () => {
                setMqttStatus("Connected");
                addLog("MQTT Connected.");
                toast({ title: "MQTT Connected", description: `Connected to ${mqttBrokerUrl}` });
            });

            client.on("error", (err) => {
                console.error("MQTT Connection Error:", err);
                if (mqttClientRef.current === client) {
                    setMqttStatus("Error");
                    addLog(`MQTT Error: ${err.message}`);
                    toast({ variant: "destructive", title: "MQTT Error", description: "Failed to connect. Check URL or network." });
                    client.end(true);
                    mqttClientRef.current = null;
                }
            });
            
            client.on("reconnect", () => {
                if(mqttClientRef.current === client) {
                    setMqttStatus("Connecting");
                    addLog("MQTT Reconnecting...");
                }
            });

            client.on("close", () => {
                 if (mqttClientRef.current === client) {
                    setMqttStatus("Disconnected");
                    addLog("MQTT Disconnected.");
                    mqttClientRef.current = null;
                 }
            });
        } catch (error: any) {
            console.error("MQTT Initialization Error:", error);
            setMqttStatus("Error");
            addLog(`MQTT Initialization Error: ${error.message}`);
            toast({ variant: "destructive", title: "MQTT Error", description: "Invalid broker URL." });
        }
    }

    if (!mqttBrokerUrl) {
      addLog("MQTT Broker URL is empty. Cannot connect.");
      setMqttStatus("Error");
      return;
    }
    
    // This logic ensures we don't create multiple connections
    if (mqttStatus !== "Connecting" && mqttStatus !== "Connected") {
        proceedWithConnection();
    } else if(mqttStatus === "Connected"){
        // If already connected, but URL changed, reconnect.
        const currentUrl = mqttClientRef.current?.options.href;
        if(currentUrl && mqttBrokerUrl && currentUrl !== mqttBrokerUrl) {
            addLog("Broker URL changed, reconnecting...");
            proceedWithConnection();
        }
    }
  }, [mqttBrokerUrl, toast, addLog, mqttStatus]);


  const disconnectFromMqtt = useCallback(() => {
    if (mqttClientRef.current) {
      addLog("Disconnecting from MQTT broker.");
      mqttClientRef.current.end(true, () => {
        // This callback ensures the internal state is updated after disconnection.
      });
      mqttClientRef.current = null;
      setMqttStatus("Disconnected");
    }
  }, [addLog]);
  
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    
    if (isHibernating) {
      setIsHibernating(false);
      addLog("Activity detected, waking from hibernation.");
    }

    inactivityTimerRef.current = setTimeout(() => {
        setIsHibernating(true);
        setPrediction(null);
        setDetectedObjects([]);
        addLog("Inactivity detected, entering hibernation mode.");
    }, INACTIVITY_TIMEOUT);
  }, [isHibernating, addLog]);

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

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    streamRef.current = null;
    setIsCameraOn(false);
    setIsFlashOn(false);
    setPrediction(null);
    setDetectedObjects([]);
    if (predictionIntervalRef.current) {
      clearInterval(predictionIntervalRef.current);
      predictionIntervalRef.current = null;
    }
    setIsHibernating(false);
    addLog("Camera stopped.");
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    releaseWakeLock();
  }, [releaseWakeLock, addLog]);

  const startCamera = useCallback(async (flashEnabled: boolean) => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        addLog("Requesting camera access...");

        // Stop any existing stream before starting a new one
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: { 
            facingMode: "environment",
            advanced: [{ torch: flashEnabled }]
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        streamRef.current = stream;
        setIsCameraOn(true);

        // Check actual flash status
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        const settings = videoTrack.getSettings();
        if (capabilities.torch) {
            setIsFlashOn(!!settings.torch);
        } else {
            setIsFlashOn(false);
            if (flashEnabled) {
                addLog("Flash/torch not supported on this device.");
                toast({ variant: "destructive", title: "Flash Not Supported", description: "This device does not support camera flash control." });
            }
        }
        
        addLog(`Camera started ${flashEnabled ? 'with flash' : 'without flash'}.`);
        resetInactivityTimer();
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
        stopCamera(); // Ensure everything is cleaned up on error
      }
    }
  }, [addLog, resetInactivityTimer, stopCamera, toast, wakeLockEnabled, requestWakeLock]);

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

  const runClassification = useCallback(async () => {
    resetInactivityTimer();
  
    if (isHibernating || !isCameraOn || !videoRef.current || !model) {
      setPrediction(null);
      setDetectedObjects([]);
      return;
    }
  
    try {
      const modelPredictions = await model.predict(videoRef.current);
      const highConfidenceDetections = modelPredictions
        .map((p, i) => ({
          id: i,
          label: p.className,
          confidence: p.probability,
          bbox: [0.1, 0.1, 0.8, 0.8] as BoundingBox, // Default bbox, update if model provides it
          rotation: 0,
        }))
        .filter(p => p.confidence > 0.1); // Lower threshold to see what model is "thinking"

        setDetectedObjects(highConfidenceDetections.map(p => ({
          ...p,
          rotation: Math.random() * 10 - 5 // slight rotation for visual effect
        })));


      const primaryPrediction = highConfidenceDetections.reduce((max, p) => p.confidence > max.confidence ? p : max, highConfidenceDetections[0]);

      if (primaryPrediction && primaryPrediction.confidence > CONFIDENCE_THRESHOLD) {
          setPrediction(primaryPrediction);
          addLog(`Classified: ${primaryPrediction.label} (Confidence: ${(primaryPrediction.confidence * 100).toFixed(0)}%)`);
          if (mqttClientRef.current?.connected && highConfidenceDetections.length === 1) {
              mqttClientRef.current.publish(mqttTopic, primaryPrediction.label);
              addLog(`Published '${primaryPrediction.label}' to MQTT topic '${mqttTopic}'`);
          }
          setLastClassifications((prev) => [...prev, primaryPrediction]);
      } else {
          setPrediction(null);
      }
    } catch (error) {
      console.error("Error during prediction:", error);
      addLog("Prediction error. Check console.");
      setPrediction(null);
      setDetectedObjects([]);
    }
  
  }, [resetInactivityTimer, mqttTopic, isHibernating, addLog, isCameraOn, model]);


  useEffect(() => {
    if (isCameraOn && model) {
      if (!predictionIntervalRef.current) {
        predictionIntervalRef.current = setInterval(runClassification, 2000);
      }
    } else {
      if (predictionIntervalRef.current) {
        clearInterval(predictionIntervalRef.current);
        predictionIntervalRef.current = null;
      }
    }

    return () => {
      if (predictionIntervalRef.current) {
        clearInterval(predictionIntervalRef.current);
      }
    };
  }, [isCameraOn, model, runClassification]);
  
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
      if (lastClassifications.length >= MODEL_SWAP_CHECK_THRESHOLD) {
        addLog(`Checking model performance with ${lastClassifications.length} classifications.`);
        const classificationsToAnalyze = [...lastClassifications];
        setLastClassifications([]);

        const scores: { [key: string]: number[] } = { Plastic: [], Metal: [], Paper: [] };
         model?.getClassLabels().forEach(label => {
            scores[label] = [];
        });

        classificationsToAnalyze.forEach(p => {
            if (p.label in scores) {
                scores[p.label].push(p.confidence);
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
      }
    };

    checkModelPerformance();
  }, [lastClassifications, toast, addLog, model]);
  
   useEffect(() => {
    // Initial connection
    if (mqttBrokerUrl) connectToMqtt();

    return () => {
      stopCamera();
      disconnectFromMqtt();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to handle reconnection when settings change
  useEffect(() => {
    if (!mqttBrokerUrl) return;

    if (!mqttClientRef.current || !mqttClientRef.current.connected) {
        connectToMqtt();
        return;
    }

    try {
        const clientHref = mqttClientRef.current.options.href;
        if (!clientHref) {
             addLog("MQTT client URL is not available, reconnecting...");
             connectToMqtt();
             return;
        }
        const clientUrl = new URL(clientHref);
        const stateUrl = new URL(mqttBrokerUrl);

        if (clientUrl.href !== stateUrl.href) {
             addLog("MQTT broker details changed, reconnecting...");
             connectToMqtt();
        }
    } catch (error) {
        addLog("Invalid MQTT URL format. Cannot compare for reconnection.");
    }
  }, [mqttBrokerUrl, connectToMqtt, addLog]);


  const getMqttBadgeVariant = () => {
    switch (mqttStatus) {
      case "Connected": return "default";
      case "Connecting": return "secondary";
      case "Error": return "destructive";
      case "Disconnected": return "outline";
    }
  };

  const PredictionDisplay = () => (
    <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
      {detectedObjects.length > 1 && !prediction && !isHibernating ? (
        <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-yellow-400" />
            <h3 className="text-xl font-bold text-yellow-400 drop-shadow-lg">
                Multiple items possible
            </h3>
        </div>
      ) : prediction && !isHibernating ? (
        <>
          <h3 className="text-2xl font-bold text-white drop-shadow-lg">
            {prediction.label}
          </h3>
          <div className="flex items-center gap-2">
            <p className="text-sm text-white/90 drop-shadow-md">
                Confidence:
            </p>
            <Progress value={prediction.confidence * 100} className="h-2 w-24 bg-white/30" />
            <span className="text-sm font-semibold text-white">
                {(prediction.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </>
      ) : (
        <p className="text-lg text-white/90 shadow-md">
          {isCameraOn ? (isHibernating ? "Hibernating..." : model ? "Analyzing..." : "Awaiting model...") : "Camera is off"}
        </p>
      )}
    </div>
  );

  const ItemIcon = () => {
    const getActiveClass = (label: string) => {
        if (prediction?.label.toLowerCase() === label.toLowerCase() && prediction.confidence > CONFIDENCE_THRESHOLD && !isHibernating) {
            return "text-primary drop-shadow-[0_0_10px_hsl(var(--primary))]";
        }
        return "";
    };
    
    const baseClass = "h-12 w-12 text-muted-foreground transition-all duration-300";
    
    return (
       <div className="flex flex-col items-center justify-center h-full p-4">
          <div className="flex flex-col items-center gap-6 p-4">
            <PlasticIcon className={cn(baseClass, getActiveClass('Plastic'))} />
            <MetalIcon className={cn(baseClass, getActiveClass('Metal'))} />
            <PaperIcon className={cn(baseClass, getActiveClass('Paper'))} />
          </div>
      </div>
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
                  : "Drag & drop a .zip file"}
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
                accept=".zip"
                onChange={handleFileSelect}
                disabled={isModelLoading}
              />
            </div>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>MQTT Configuration</SidebarGroupLabel>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="mqtt-broker">Broker URL</Label>
                <SidebarInput id="mqtt-broker" value={mqttBrokerUrl} onChange={handleMqttBrokerUrlChange} placeholder="wss://broker.hivemq.com:8884/mqtt" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mqtt-topic">Topic</Label>
                <SidebarInput id="mqtt-topic" value={mqttTopic} onChange={handleMqttTopicChange} placeholder="trash/classification" />
              </div>
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
            {isHibernating && <Badge variant="secondary" className="gap-2 text-xs animate-pulse"><PowerOff className="h-3 w-3" /> Hibernating</Badge>}
            <Badge variant={getMqttBadgeVariant()} className="gap-2 text-xs">
              MQTT: {mqttStatus}
            </Badge>
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
              {isCameraOn && !isHibernating && detectedObjects.map((obj) => {
                const [x, y, w, h] = obj.bbox;
                const colors = {
                  Plastic: 'border-blue-400',
                  Metal: 'border-yellow-400',
                  Paper: 'border-green-400',
                };
                const textColors = {
                  Plastic: 'bg-blue-400',
                  Metal: 'bg-yellow-400',
                  Paper: 'bg-green-400',
                };
                const borderColor = colors[obj.label as keyof typeof colors] || 'border-gray-400';
                const bgColor = textColors[obj.label as keyof typeof textColors] || 'bg-gray-400';

                return (
                  <div
                    key={obj.id}
                    className={cn(
                      'absolute transition-all duration-300 border-2 rounded-md',
                      borderColor
                    )}
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                      transform: `rotate(${obj.rotation}deg)`,
                      opacity: obj.confidence,
                    }}
                  >
                    <div
                      className={cn(
                        'absolute -top-6 left-0 text-xs font-semibold text-white px-2 py-0.5 rounded-t-md',
                        bgColor
                      )}
                      style={{
                        transform: `rotate(${-obj.rotation}deg)`,
                        transformOrigin: 'bottom left',
                      }}
                    >
                      {obj.label} ({(obj.confidence * 100).toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border-2 border-dashed border-border/20 h-full">
                <ItemIcon />
              </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-2 items-center">
            <p className="text-xs text-muted-foreground">Press <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">⌘</kbd> <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">B</kbd> to toggle sidebar.</p>
            <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto">
              <Button onClick={toggleCamera} variant="outline" className="flex-grow sm:flex-grow-0">
                {isCameraOn ? <CameraOff /> : <Camera />}
                {isCameraOn ? "Stop Camera" : "Start Camera"}
              </Button>
               <Button onClick={toggleFlash} variant="outline" size="icon" disabled={!isCameraOn}>
                {isFlashOn ? <FlashlightOff /> : <Flashlight />}
              </Button>
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <Button onClick={connectToMqtt} disabled={mqttStatus === "Connecting"} variant="outline" className="w-full">
                    {mqttStatus === "Connected" ? <Wifi /> : <WifiOff />}
                    {mqttStatus === 'Connected' ? 'Reconnect' : mqttStatus === "Connecting" ? 'Connecting...' : 'Connect'}
                  </Button>
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
            <ScrollArea className="flex-1 my-4">
                <div className="p-4 font-mono text-xs">
                    {logs.map((log, index) => (
                        <p key={index}>
                           <span className="text-muted-foreground/50">{log.timestamp}</span>
                           <span className="ml-2">{log.message}</span>
                        </p>
                    ))}
                </div>
            </ScrollArea>
            <SheetFooter>
                <Button variant="outline" onClick={() => setLogs([])}>Clear Logs</Button>
            </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

    