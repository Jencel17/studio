
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";

import SortVisionClient from "@/components/sort-vision-client";
import SortVisionSettings from "@/components/sort-vision-settings";
import SplashScreen from "@/components/splash-screen";
import { AppStatus, LogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

export default function SortVision() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    
    const [isTestMode, setIsTestMode] = useState(false);
    const [wakeLockEnabled, setWakeLockEnabled] = useState(true);
    const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
    const [autoSortEnabled, setAutoSortEnabled] = useState(true);
    const [autoFlashEnabled, setAutoFlashEnabled] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    
    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);
    const { toast } = useToast();

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, 100));
    }, []);

    useEffect(() => {
        const loadAiLibraries = async () => {
            if (tmImageRef.current && tfRef.current) {
                addLog("AI libraries already loaded.");
                setAppStatus("AWAITING_MODEL");
                return;
            }
            addLog("Loading AI libraries...");
            setAppStatus("LOADING_LIBS");
            try {
                const [tm, tfModule] = await Promise.all([
                    import("@teachablemachine/image"),
                    import("@tensorflow/tfjs"),
                ]);
                tmImageRef.current = tm;
                tfRef.current = tfModule;
                addLog("AI libraries loaded successfully.");
                setAppStatus("AWAITING_MODEL");
            } catch (error: any) {
                console.error("Failed to load AI libraries:", error);
                toast({
                    variant: "destructive",
                    title: "Library Load Error",
                    description: "Could not load core AI libraries. Please refresh the page.",
                });
                addLog("FATAL: Failed to load AI libraries.");
            }
        };

        loadAiLibraries();
    }, [addLog, toast]);

    if (appStatus === 'LOADING_LIBS') {
        return <SplashScreen />;
    }

    return (
    <div className="flex h-full min-h-screen w-full items-center justify-center bg-background text-foreground">
      <SortVisionSettings 
        model={model}
        setModel={setModel}
        setAppStatus={setAppStatus}
        tmImageRef={tmImageRef}
        isTestMode={isTestMode}
        setIsTestMode={setIsTestMode}
        wakeLockEnabled={wakeLockEnabled}
        setWakeLockEnabled={setWakeLockEnabled}
        autoCaptureEnabled={autoCaptureEnabled}
        setAutoCaptureEnabled={setAutoCaptureEnabled}
        autoSortEnabled={autoSortEnabled}
        setAutoSortEnabled={setAutoSortEnabled}
        autoFlashEnabled={autoFlashEnabled}
        setAutoFlashEnabled={setAutoFlashEnabled}
        addLog={addLog}
      />

      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <SortVisionClient
          model={model}
          appStatus={appStatus}
          setAppStatus={setAppStatus}
          isTestMode={isTestMode}
          wakeLockEnabled={wakeLockEnabled}
          autoCaptureEnabled={autoCaptureEnabled}
          autoSortEnabled={autoSortEnabled}
          autoFlashEnabled={autoFlashEnabled}
          tmImageRef={tmImageRef}
          logs={logs}
          setLogs={setLogs}
          addLog={addLog}
        />
      </main>
    </div>
  );
}
