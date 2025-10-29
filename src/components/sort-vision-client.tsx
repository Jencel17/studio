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
import { Camera, CameraOff, Wifi, WifiOff } from "lucide-react";
import { MetalIcon, PaperIcon, PlasticIcon } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { handleModelSwapCheck } from "@/app/actions/ai";
import { cn } from "@/lib/utils";

type Prediction = {
  label: "Plastic" | "Metal" | "Paper";
  confidence: number;
};

type MqttStatus = "Connected" | "Disconnected" | "Connecting" | "Error";

const MQTT_BROKER_URL = "wss://broker.hivemq.com:8081/mqtt";
const MQTT_TOPIC = "trash/classification";
const CONFIDENCE_THRESHOLD = 0.8;
const CLASSIFICATION_INTERVAL = 1000; // ms
const MODEL_SWAP_CHECK_THRESHOLD = 20;

export default function SortVisionClient() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [lastClassifications, setLastClassifications] = useState<Prediction[]>([]);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("Disconnected");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const predictionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  const connectToMqtt = useCallback(() => {
    if (mqttClientRef.current?.connected || mqttClientRef.current?.reconnecting) return;

    setMqttStatus("Connecting");
    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `sortvision_web_${Math.random().toString(16).substr(2, 8)}`,
    });
    mqttClientRef.current = client;

    client.on("connect", () => setMqttStatus("Connected"));
    client.on("error", (err) => {
      console.error("MQTT Connection Error:", err);
      setMqttStatus("Error");
      client.end();
    });
    client.on("reconnect", () => setMqttStatus("Connecting"));
    client.on("close", () => setMqttStatus("Disconnected"));
  }, []);

  const disconnectFromMqtt = useCallback(() => {
    if (mqttClientRef.current) {
      mqttClientRef.current.end();
      mqttClientRef.current = null;
      setMqttStatus("Disconnected");
    }
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
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const runClassification = useCallback(() => {
    const labels: Prediction["label"][] = ["Plastic", "Metal", "Paper"];
    const label = labels[Math.floor(Math.random() * labels.length)];
    const confidence = Math.random();
    const newPrediction: Prediction = { label, confidence };

    setPrediction(newPrediction);

    if (confidence > CONFIDENCE_THRESHOLD) {
      if (mqttClientRef.current?.connected) {
        mqttClientRef.current.publish(MQTT_TOPIC, label);
      }
      setLastClassifications((prev) => [...prev, newPrediction]);
    }
  }, []);

  useEffect(() => {
    if (isCameraOn) {
      predictionIntervalRef.current = setInterval(runClassification, CLASSIFICATION_INTERVAL);
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
    connectToMqtt();
    return () => disconnectFromMqtt();
  }, [connectToMqtt, disconnectFromMqtt]);

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
          <h3 className="text-2xl font-bold text-white shadow-lg">
            {prediction.label}
          </h3>
          <p className="text-lg text-white/90 shadow-md">
            Confidence: {(prediction.confidence * 100).toFixed(0)}%
          </p>
          <Progress value={prediction.confidence * 100} className="mt-2 h-2" />
        </>
      ) : (
        <p className="text-lg text-white/90 shadow-md">
          {isCameraOn ? "Analyzing..." : "Camera is off"}
        </p>
      )}
    </div>
  );

  const ItemIcon = ({ label, confidence }: Prediction) => {
    const isActive = confidence > CONFIDENCE_THRESHOLD;
    const activeClass = "text-primary drop-shadow-[0_0_5px_hsl(var(--primary))]";
    switch (label) {
      case "Plastic":
        return <PlasticIcon className={cn("h-8 w-8 transition-all", isActive && activeClass)} />;
      case "Metal":
        return <MetalIcon className={cn("h-8 w-8 transition-all", isActive && activeClass)} />;
      case "Paper":
        return <PaperIcon className={cn("h-8 w-8 transition-all", isActive && activeClass)} />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-2xl shadow-2xl">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-2xl font-headline">SortVision</CardTitle>
          <CardDescription>AI Trash Sorting Assistant</CardDescription>
        </div>
        <Badge variant={getMqttBadgeVariant()} className="gap-2">
          MQTT: {mqttStatus}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
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
      </CardContent>
      <CardFooter className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-4 text-muted-foreground">
          {prediction ? (
            <ItemIcon {...prediction} />
          ) : (
            <>
                <PlasticIcon className="h-8 w-8" />
                <MetalIcon className="h-8 w-8" />
                <PaperIcon className="h-8 w-8" />
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={toggleCamera} variant="outline">
            {isCameraOn ? <CameraOff /> : <Camera />}
            {isCameraOn ? "Stop Camera" : "Start Camera"}
          </Button>
          <Button onClick={connectToMqtt} disabled={mqttStatus === "Connected" || mqttStatus === "Connecting"}>
            {mqttStatus === "Connected" ? <Wifi /> : <WifiOff />}
            Reconnect MQTT
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
