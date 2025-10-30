
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
import { Camera, CameraOff, Wifi, WifiOff, PowerOff, Smartphone, Terminal, Flashlight, FlashlightOff, AlertTriangle, Upload, FileUp, Hourglass } from "lucide-react";
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
  className: string;
  probability: number;
};

type BoundingBox = [number, number, number, number]; // [x, y, width, height]

type DetectedObject = {
  id: string; // Use string for more stable keys
  label: Prediction['className'];
  confidence: number;
  bbox: BoundingBox;
  // For animation
  vx: number; 
  vy: number;
  vw: number;
  vh: number;
};

type MqttStatus = "Connected" | "Disconnected" | "Connecting" | "Error";

type LogEntry = {
  timestamp: string;
  message: string;
};

type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

const CLASSIFICATION_INTERVAL = 200;
const MODEL_SWAP_CHECK_THRESHOLD = 20;
const INACTIVITY_TIMEOUT = 60000; // 1 minute
const MAX_LOGS = 100;
const MQTT_COOLDOWN_MS = 5000;

export default function SortVisionClient() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
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
  const [modelLabels, setModelLabels] = useState<string[]>([]);
  const [detectionState, setDetectionState] = useState<DetectionState>("NO_DETECTION");
  const [primaryPrediction, setPrimaryPrediction] = useState<Prediction | null>(null);
  const [currentPredictions, setCurrentPredictions] = useState<Prediction[]>([]);
  const [isMqttOnCooldown, setIsMqttOnCooldown] = useState(false);


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
  const animationFrameRef = useRef<number>();
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  
  const addLog = useCallback((message: string) => {
    const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        message,
    };
    setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, MAX_LOGS));
  }, []);

  const loadModelFromFiles = useCallback(async (modelFile: File, metadataFile: File, weightsFile: File) => {
    setIsModelLoading(true);
    addLog("Loading Teachable Machine model from files...");
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      
      const loadedModel = await tmImage.loadFromFiles(modelFile, weightsFile, metadataFile);
      
      setModel(loadedModel);
      const labels = loadedModel.getClassLabels();
      setModelLabels(labels);
      
      addLog(`Model loaded successfully. Classes: ${labels.join(', ')}`);
      toast({ title: "Model Loaded", description: "Teachable Machine model is ready." });
      
    } catch (error: any) {
        console.error("Model loading error:", error);
        addLog(`Model loading failed: ${error.message}`);
        toast({ variant: "destructive", title: "Model Load Error", description: "Could not load the model. Check console for details." });
        setModel(null);
        setModelLabels([]);
    } finally {
        setIsModelLoading(false);
    }
  }, [addLog, toast]);

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
    event.target.value = '';
  };


  useEffect(() => {
    const savedBrokerUrl = localStorage.getItem("mqttBrokerUrl");
    const savedMqttTopic = localStorage.getItem("mqttTopic");
    if (savedBrokerUrl) setMqttBrokerUrl(savedBrokerUrl);
    if (savedMqttTopic) setMqttTopic(savedMqttTopic);
    addLog("App initialized.");
  }, [addLog]);
  
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
    
    if (mqttStatus !== "Connecting" && mqttStatus !== "Connected") {
        proceedWithConnection();
    } else if(mqttStatus === "Connected"){
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
      mqttClientRef.current.end(true, () => {});
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

    // Temporarily disable hibernation
    /*
    inactivityTimerRef.current = setTimeout(() => {
        if (isCameraOn) {
            setIsHibernating(true);
            setPrimaryPrediction(null);
            setDetectedObjects([]);
            addLog("Inactivity detected, entering hibernation mode.");
        }
    }, INACTIVITY_TIMEOUT);
    */
  }, [isHibernating, addLog, isCameraOn]);

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
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    streamRef.current = null;
    setIsCameraOn(false);
    setIsFlashOn(false);
    setPrimaryPrediction(null);
    setDetectedObjects([]);
    if (predictionIntervalRef.current) {
      clearInterval(predictionIntervalRef.current);
      predictionIntervalRef.current = null;
    }
    setIsHibernating(false);
    addLog("Camera stopped.");
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    releaseWakeLock();
  }, [releaseWakeLock, addLog]);

  const startCamera = useCallback(async (flashEnabled: boolean) => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        addLog("Requesting camera access...");

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
        stopCamera();
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
    // Exit if camera is off or model not loaded
    if (!isCameraOn || !videoRef.current || !model) {
      return;
    }
  
    // Always reset the inactivity timer on each run
    resetInactivityTimer();
  
    // Stop detection if hibernating
    if (isHibernating) {
      // If we are hibernating, we don't do anything else.
      return;
    }
  
    try {
      // --- 1. Always get the latest predictions ---
      const predictions = await model.predict(videoRef.current);
      setCurrentPredictions(predictions); // Keep track of latest predictions for the side panel
  
      // --- 2. Determine Detection State and update UI state ---
      const highConfidencePrediction = predictions.find((p) => p.probability > 0.9);
      const multipleDetections = predictions.filter((p) => p.probability > 0.5).length > 1;
  
      if (highConfidencePrediction) {
        setDetectionState("SINGLE_OBJECT");
        setPrimaryPrediction(highConfidencePrediction);
        setDetectedObjects([]);
      } else if (multipleDetections) {
        setDetectionState("MULTIPLE_OBJECTS");
        setPrimaryPrediction(null);
        setDetectedObjects((currentObjects) => {
          const significantDetections = predictions.filter((p) => p.probability > 0.5);
          return significantDetections.map((det) => {
            const existing = currentObjects.find((o) => o.id === det.className);
            if (existing) {
              return { ...existing, confidence: det.probability, label: det.className };
            }
            const size = 0.3 + Math.random() * 0.3;
            return {
              id: det.className,
              label: det.className,
              confidence: det.probability,
              bbox: [Math.random() * (1 - size), Math.random() * (1 - size), size, size],
              vx: (Math.random() - 0.5) * 0.005,
              vy: (Math.random() - 0.5) * 0.005,
              vw: (Math.random() - 0.5) * 0.001,
              vh: (Math.random() - 0.5) * 0.001,
            };
          });
        });
      } else {
        setDetectionState("NO_DETECTION");
        setPrimaryPrediction(null);
        setDetectedObjects([]);
      }
  
      // --- 3. Handle MQTT messaging ---
      if (highConfidencePrediction && mqttClientRef.current?.connected && !isMqttOnCooldown) {
        const labelToSend = highConfidencePrediction.className;
        mqttClientRef.current.publish(mqttTopic, labelToSend);
        addLog(`Published '${labelToSend}' to MQTT topic '${mqttTopic}'`);
        toast({
          title: "MQTT Message Sent",
          description: `Sent classification: ${labelToSend}`,
        });
  
        setIsMqttOnCooldown(true);
        cooldownTimerRef.current = setTimeout(() => {
            setIsMqttOnCooldown(false);
            addLog("MQTT cooldown finished.");
        }, MQTT_COOLDOWN_MS);
      }
    } catch (error) {
      console.error("Error during prediction:", error);
      addLog("Prediction error. Check console.");
    }
  }, [isCameraOn, model, resetInactivityTimer, mqttTopic, addLog, toast, isMqttOnCooldown, isHibernating]);


  useEffect(() => {
    const animate = () => {
      setDetectedObjects(currentObjects => 
        currentObjects.map(obj => {
          let [x, y, w, h] = obj.bbox;
          let { vx, vy, vw, vh } = obj;

          // Update position
          x += vx;
          y += vy;
          
          // Bounce off walls
          if (x < 0 || x + w > 1) vx *= -1;
          if (y < 0 || y + h > 1) vy *= -1;

          // Update size
          w += vw;
          h += vh;

          // Clamp size and reverse velocity if limits are hit
          if (w < 0.2 || w > 0.7) vw *= -1;
          if (h < 0.2 || h > 0.7) vh *= -1;
          w = Math.max(0.2, Math.min(0.7, w));
          h = Math.max(0.2, Math.min(0.7, h));

          return {...obj, bbox: [x, y, w, h], vx, vy, vw, vh};
        })
      );
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (isCameraOn && model && !isHibernating && detectedObjects.length > 0) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraOn, model, isHibernating, detectedObjects]);


  useEffect(() => {
    if (isCameraOn && model) {
      if (!predictionIntervalRef.current) {
        predictionIntervalRef.current = setInterval(runClassification, CLASSIFICATION_INTERVAL);
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
    if (mqttBrokerUrl) connectToMqtt();

    return () => {
      stopCamera();
      disconnectFromMqtt();
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const PredictionDisplay = () => {
    return (
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
        {detectionState === "MULTIPLE_OBJECTS" ? (
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-yellow-400" />
                <h3 className="text-xl font-bold text-yellow-400 drop-shadow-lg">
                    Multiple objects detected
                </h3>
            </div>
        ) : detectionState === "SINGLE_OBJECT" && primaryPrediction && !isHibernating ? (
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
        ) : (
            <p className="text-lg text-white/90 shadow-md">
            {isCameraOn ? (isHibernating ? "Hibernating..." : isMqttOnCooldown ? "Cooldown..." : model ? "Analyzing..." : "Awaiting model...") : "Camera is off"}
            </p>
        )}
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
                modelLabels.map(label => {
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
            {isMqttOnCooldown && <Badge variant="secondary" className="gap-2 text-xs"><Hourglass className="h-3 w-3 animate-spin" /> Cooldown</Badge>}
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
                  [modelLabels[0]]: 'border-blue-400',
                  [modelLabels[1]]: 'border-yellow-400',
                  [modelLabels[2]]: 'border-green-400',
                };
                const textColors = {
                  [modelLabels[0]]: 'bg-blue-400',
                  [modelLabels[1]]: 'bg-yellow-400',
                  [modelLabels[2]]: 'bg-green-400',
                };
                 const bgColors = {
                  [modelLabels[0]]: 'bg-blue-400/10',
                  [modelLabels[1]]: 'bg-yellow-400/10',
                  [modelLabels[2]]: 'bg-green-400/10',
                };

                const borderColor = colors[obj.label as keyof typeof colors] || 'border-gray-400';
                const textColor = textColors[obj.label as keyof typeof textColors] || 'bg-gray-400';
                const bgColor = bgColors[obj.label as keyof typeof bgColors] || 'bg-gray-400/10';


                return (
                  <div
                    key={obj.id}
                    className={cn(
                      'absolute transition-all duration-300 border-2 rounded-md',
                      borderColor,
                      bgColor
                    )}
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                      opacity: obj.confidence,
                    }}
                  >
                    <div
                      className={cn(
                        'absolute -top-6 left-0 text-xs font-semibold text-white px-2 py-0.5 rounded-tmd',
                        textColor
                      )}
                    >
                      {obj.label} ({(obj.confidence * 100).toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border-2 border-dashed border-border/20 h-full w-[240px]">
                <DetectionRates />
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

    