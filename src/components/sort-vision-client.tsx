
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MqttClient, IClientOptions } from "mqtt";
import mqtt from "mqtt";
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
import { Camera, CameraOff, Wifi, WifiOff, PowerOff, Smartphone, Terminal } from "lucide-react";
import { MetalIcon, PaperIcon, PlasticIcon } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger, SidebarGroup, SidebarGroupLabel, SidebarInput, SidebarFooter, SidebarTitle } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Prediction = {
  label: "Plastic" | "Metal" | "Paper";
  confidence: number;
};

type MqttStatus = "Connected" | "Disconnected" | "Connecting" | "Error";

type LogEntry = {
  timestamp: string;
  message: string;
};

const CONFIDENCE_THRESHOLD = 0.8;
const CLASSIFICATION_INTERVAL = 1000;
const MODEL_SWAP_CHECK_THRESHOLD = 20;
const INACTIVITY_TIMEOUT = 60000; // 1 minute
const MAX_LOGS = 100;

export default function SortVisionClient() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("Disconnected");
  const [isHibernating, setIsHibernating] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);


  // MQTT Settings
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState("wss://broker.hivemq.com:8081/mqtt");
  const [mqttTopic, setMqttTopic] = useState("trash/classification");


  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const { toast } = useToast();
  
  const addLog = useCallback((message: string) => {
    const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        message,
    };
    setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, MAX_LOGS));
  }, []);

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
                connectTimeout: 20000,
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

    // This logic ensures we don't create multiple connections
    if (mqttStatus !== "Connecting" && mqttStatus !== "Connected") {
        proceedWithConnection();
    } else if(mqttStatus === "Connected"){
        // If already connected, but URL changed, reconnect.
        const currentUrl = mqttClientRef.current?.options.href;
        if(currentUrl && currentUrl !== mqttBrokerUrl) {
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


  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        addLog("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        streamRef.current = stream;
        setIsCameraOn(true);
        addLog("Camera started successfully.");
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
      }
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
    setPrediction(null);
    setIsHibernating(false);
    addLog("Camera stopped.");
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    releaseWakeLock();
  }, [releaseWakeLock, addLog]);

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const runClassification = useCallback(() => {
    const isActivityDetected = Math.random() > 0.5;

    if (isActivityDetected) {
      resetInactivityTimer();
    }

    if (!isHibernating) {
        const labels: Prediction["label"][] = ["Plastic", "Metal", "Paper"];
        const predictions: Prediction[] = labels.map(label => {
            let confidence = Math.random() * 0.6; // Base confidence
            if (label === 'Plastic' && Math.random() > 0.3) {
              confidence = Math.random() * 0.4 + 0.6; // Higher confidence for Plastic
            }
             if (label === 'Metal' && Math.random() > 0.5) {
              confidence = Math.random() * 0.4 + 0.6; // Higher confidence for Metal
            }
            if (label === 'Paper' && Math.random() > 0.5) {
                confidence = Math.random() * 0.4 + 0.6; // Higher confidence for Paper
            }
            return { label, confidence };
        });

        const highestPrediction = predictions.reduce(
            (max, p) => (p.confidence > max.confidence ? p : max),
            predictions[0]
        );

        setPrediction(highestPrediction);

        if (highestPrediction.confidence > CONFIDENCE_THRESHOLD) {
            addLog(`Classified: ${highestPrediction.label} (Confidence: ${(highestPrediction.confidence * 100).toFixed(0)}%)`);
            if (mqttClientRef.current?.connected) {
                mqttClientRef.current.publish(mqttTopic, highestPrediction.label);
                addLog(`Published '${highestPrediction.label}' to MQTT topic '${mqttTopic}'`);
            }
            setLastClassifications((prev) => [...prev, highestPrediction]);
        }
    }
  }, [resetInactivityTimer, mqttTopic, isHibernating, addLog]);

  useEffect(() => {
    if (isCameraOn) {
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
  }, [isCameraOn, runClassification]);
  
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
  }, [lastClassifications, toast, addLog]);
  
   useEffect(() => {
    // Initial connection
    connectToMqtt();

    return () => {
      stopCamera();
      disconnectFromMqtt();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to handle reconnection when settings change
  useEffect(() => {
    if (mqttClientRef.current) {
        const clientHref = mqttClientRef.current.options.href;
        if (clientHref) {
            try {
                const clientUrl = new URL(clientHref);
                const stateUrl = new URL(mqttBrokerUrl);
                if (clientUrl.host !== stateUrl.host || clientUrl.port !== stateUrl.port) {
                    connectToMqtt();
                }
            } catch (error) {
                console.error("Error parsing URL for MQTT reconnection check:", error);
            }
        }
    }
  }, [mqttBrokerUrl, connectToMqtt]);

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
      {prediction && !isHibernating && prediction.confidence > CONFIDENCE_THRESHOLD ? (
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
          {isCameraOn ? (isHibernating ? "Hibernating..." : "Analyzing...") : "Camera is off"}
        </p>
      )}
    </div>
  );

  const ItemIcon = ({ label, confidence }: Prediction) => {
    const isActive = confidence > CONFIDENCE_THRESHOLD && !isHibernating;
    const activeClass = "text-primary drop-shadow-[0_0_10px_hsl(var(--primary))]";
    const baseClass = "h-12 w-12 text-muted-foreground transition-all duration-300";
    
    const icons = {
      Plastic: <PlasticIcon className={cn(baseClass, "text-foreground", isActive && label === 'Plastic' && activeClass)} />,
      Metal: <MetalIcon className={cn(baseClass, "text-foreground", isActive && label === 'Metal' && activeClass)} />,
      Paper: <PaperIcon className={cn(baseClass, "text-foreground", isActive && label === 'Paper' && activeClass)} />
    };

    return (
       <div className="flex flex-col items-center justify-center h-full p-4">
        {isActive ? (
            icons[label]
        ) : (
          <div className="flex flex-col items-center gap-6 p-4">
            <PlasticIcon className={cn(baseClass)} />
            <MetalIcon className={cn(baseClass)} />
            <PaperIcon className={cn(baseClass)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarTitle>Settings</SidebarTitle>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <SidebarGroup>
            <SidebarGroupLabel>MQTT Configuration</SidebarGroupLabel>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="mqtt-broker">Broker URL</Label>
                <SidebarInput id="mqtt-broker" value={mqttBrokerUrl} onChange={handleMqttBrokerUrlChange} placeholder="wss://broker.hivemq.com:8081/mqtt" />
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
              <PredictionDisplay />
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border-2 border-dashed border-border/20 h-full">
                <ItemIcon {...(prediction || {label: 'Plastic', confidence: 0})} />
              </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:justify-between gap-2 items-center">
            <p className="text-xs text-muted-foreground">Press <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">⌘</kbd> <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">B</kbd> to toggle sidebar.</p>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button onClick={toggleCamera} variant="outline" className="w-full sm:w-auto">
                {isCameraOn ? <CameraOff /> : <Camera />}
                {isCameraOn ? "Stop Camera" : "Start Camera"}
              </Button>
              <Button onClick={connectToMqtt} disabled={mqttStatus === "Connecting"} variant="outline" className="w-full sm:w-auto">
                {mqttStatus === "Connected" ? <Wifi /> : <WifiOff />}
                {mqttStatus === 'Connected' ? 'Reconnect' : mqttStatus === "Connecting" ? 'Connecting...' : 'Connect'}
              </Button>
               <Button onClick={() => setIsConsoleOpen(true)} variant="outline" className="w-full sm:w-auto">
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
