"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MqttClient } from "mqtt";
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
import { Camera, CameraOff, Wifi, WifiOff, Settings, Power, PowerOff } from "lucide-react";
import { MetalIcon, PaperIcon, PlasticIcon } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarInput, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";

type Prediction = {
  label: "Plastic" | "Metal" | "Paper";
  confidence: number;
};

type MqttStatus = "Connected" | "Disconnected" | "Connecting" | "Error";

const CONFIDENCE_THRESHOLD = 0.8;
const CLASSIFICATION_INTERVAL = 1000;
const MODEL_SWAP_CHECK_THRESHOLD = 20;
const INACTIVITY_TIMEOUT = 60000; // 1 minute

export default function SortVisionClient() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("Disconnected");
  const [isHibernating, setIsHibernating] = useState(false);

  // MQTT Settings
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState("wss://broker.hivemq.com:8081/mqtt");
  const [mqttTopic, setMqttTopic] = useState("trash/classification");


  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  
  // Load MQTT settings from localStorage on initial render
  useEffect(() => {
    const savedBrokerUrl = localStorage.getItem("mqttBrokerUrl");
    const savedMqttTopic = localStorage.getItem("mqttTopic");
    if (savedBrokerUrl) setMqttBrokerUrl(savedBrokerUrl);
    if (savedMqttTopic) setMqttTopic(savedMqttTopic);
  }, []);
  
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
    if (mqttClientRef.current?.connected || mqttClientRef.current?.reconnecting) {
        // If already connected or trying, disconnect first to apply new settings
        mqttClientRef.current.end(true, () => {
            setMqttStatus("Disconnected");
            // Reconnect will be called by the button click again or by effect
        });
    }

    setMqttStatus("Connecting");
    const client = mqtt.connect(mqttBrokerUrl, {
      clientId: `sortvision_web_${Math.random().toString(16).substr(2, 8)}`,
    });
    mqttClientRef.current = client;

    client.on("connect", () => {
      setMqttStatus("Connected")
      toast({ title: "MQTT Connected", description: `Connected to ${mqttBrokerUrl}`});
    });
    client.on("error", (err) => {
      console.error("MQTT Connection Error:", err);
      setMqttStatus("Error");
      toast({ variant: "destructive", title: "MQTT Error", description: err.message });
      client.end();
    });
    client.on("reconnect", () => setMqttStatus("Connecting"));
    client.on("close", () => setMqttStatus("Disconnected"));
  }, [mqttBrokerUrl, toast]);

  const disconnectFromMqtt = useCallback(() => {
    if (mqttClientRef.current) {
      mqttClientRef.current.end();
      mqttClientRef.current = null;
      setMqttStatus("Disconnected");
    }
  }, []);
  
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
    }
    setIsHibernating(false);
    inactivityTimerRef.current = setTimeout(() => {
        setIsHibernating(true);
        // We don't stop the camera, just the classification to save CPU
        if (predictionIntervalRef.current) {
            clearInterval(predictionIntervalRef.current);
            predictionIntervalRef.current = null;
        }
        setPrediction(null);
    }, INACTIVITY_TIMEOUT);
  }, []);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        streamRef.current = stream;
        setIsCameraOn(true);
        resetInactivityTimer();
      } catch (error) {
        console.error("Error accessing camera:", error);
        toast({
          variant: "destructive",
          title: "Camera Error",
          description: "Could not access the camera. Please check permissions.",
        });
      }
    }
  };

  const stopCamera = () => {
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
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const runClassification = useCallback(() => {
    resetInactivityTimer();
    const labels: Prediction["label"][] = ["Plastic", "Metal", "Paper"];
    const label = labels[Math.floor(Math.random() * labels.length)];
    const confidence = Math.random();
    const newPrediction: Prediction = { label, confidence };

    setPrediction(newPrediction);

    if (confidence > CONFIDENCE_THRESHOLD) {
      if (mqttClientRef.current?.connected) {
        mqttClientRef.current.publish(mqttTopic, label);
      }
      setLastClassifications((prev) => [...prev, newPrediction]);
    }
  }, [resetInactivityTimer, mqttTopic]);

  useEffect(() => {
    if (isCameraOn && !isHibernating) {
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
  }, [isCameraOn, isHibernating, runClassification]);

  useEffect(() => {
    const checkModelPerformance = async () => {
      if (lastClassifications.length >= MODEL_SWAP_CHECK_THRESHOLD) {
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
        
        const result = await handleModelSwapCheck({
            averageConfidenceScores,
            numClassifications: classificationsToAnalyze.length,
        });

        if (result.shouldSuggestSwap) {
          toast({
            title: "Model Performance Suggestion",
            description: result.reason,
            duration: 9000,
          });
        }
      }
    };

    checkModelPerformance();
  }, [lastClassifications, toast]);
  
  useEffect(() => {
    // Initial connection attempt
    connectToMqtt();
    
    // Cleanup on unmount
    return () => disconnectFromMqtt();
  }, []); // Note: connectToMqtt is not a dependency to prevent reconnects on setting changes

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
      {prediction ? (
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
    const isActive = confidence > CONFIDENCE_THRESHOLD;
    const activeClass = "text-primary drop-shadow-[0_0_8px_hsl(var(--primary))]";
    const baseClass = "h-10 w-10 text-muted-foreground transition-all duration-300"
    
    return (
        <div className="flex flex-col items-center gap-2">
            <PlasticIcon className={cn(baseClass, label === 'Plastic' && isActive && activeClass, label === 'Plastic' && 'text-foreground')} />
            <MetalIcon className={cn(baseClass, label === 'Metal' && isActive && activeClass, label === 'Metal' && 'text-foreground')} />
            <PaperIcon className={cn(baseClass, label === 'Paper' && isActive && activeClass, label === 'Paper' && 'text-foreground')} />
        </div>
    )
  };

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <SidebarTrigger/>
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <SidebarGroup>
            <SidebarGroupLabel>MQTT Configuration</SidebarGroupLabel>
            <div className="space-y-4 p-2">
              <div className="space-y-2">
                <Label htmlFor="mqtt-broker">Broker URL</Label>
                <SidebarInput id="mqtt-broker" value={mqttBrokerUrl} onChange={handleMqttBrokerUrlChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mqtt-topic">Topic</Label>
                <SidebarInput id="mqtt-topic" value={mqttTopic} onChange={handleMqttTopicChange} />
              </div>
               <Button onClick={connectToMqtt} disabled={mqttStatus === "Connecting"} className="w-full">
                {mqttStatus === "Connected" ? <Wifi /> : <WifiOff />}
                {mqttStatus === 'Connected' ? 'Reconnect' : 'Connect'}
              </Button>
            </div>
          </SidebarGroup>
        </SidebarContent>
        {/* ThemeToggle remains in the footer */}
      </Sidebar>
      <Card className="w-full max-w-4xl shadow-2xl bg-card/80 backdrop-blur-sm border-border/20">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold">SortVision</CardTitle>
            <CardDescription>Futuristic AI Trash Sorting</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isHibernating && <Badge variant="secondary" className="gap-2 text-xs"><PowerOff/> Hibernating</Badge>}
            <Badge variant={getMqttBadgeVariant()} className="gap-2 text-xs">
              MQTT: {mqttStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/50 border">
              <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                  autoPlay
              />
              {(!isCameraOn || isHibernating) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      {isHibernating ? <PowerOff className="h-16 w-16 text-muted-foreground" /> : <CameraOff className="h-16 w-16 text-muted-foreground" />}
                      <p className="mt-2 text-muted-foreground">{isHibernating ? "Hibernating" : "Camera is off"}</p>
                      {isHibernating && <Button variant="ghost" size="sm" className="mt-2" onClick={resetInactivityTimer}>Wake up</Button>}
                  </div>
              )}
              <PredictionDisplay />
              </div>
              <div className="hidden md:flex flex-col items-center justify-center p-4">
                  {prediction ? (
                      <ItemIcon {...prediction} />
                  ) : (
                      <div className="flex flex-col items-center gap-2">
                          <PlasticIcon className="h-10 w-10 text-muted-foreground" />
                          <MetalIcon className="h-10 w-10 text-muted-foreground" />
                          <PaperIcon className="h-10 w-10 text-muted-foreground" />
                      </div>
                  )}
              </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button onClick={toggleCamera} variant="outline" className="w-full sm:w-auto">
              {isCameraOn ? <CameraOff /> : <Camera />}
              {isCameraOn ? "Stop Camera" : "Start Camera"}
            </Button>
        </CardFooter>
      </Card>
    </>
  );
}
