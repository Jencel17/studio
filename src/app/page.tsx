
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
    const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
    const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
    const [autoSortEnabled, setAutoSortEnabled] = useState(true);
    const [autoFlashEnabled, setAutoFlashEnabled] = useState(false);
    const [cameraRestartDelay, setCameraRestartDelay] = useState(3);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    
    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);
    const { toast } = useToast();

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [...prevLogs, newLog].slice(-100));
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
                // We don't change status here, so it remains on the splash screen with an error.
            }
        };

        loadAiLibraries();
    }, [addLog, toast]);

    if (appStatus === 'LOADING_LIBS') {
        return <SplashScreen />;
    }

    return (
    <>
      <SortVisionSettings 
        model={model}
        setModel={setModel}
        setAppStatus={setAppStatus}
        tmImageRef={tmImageRef}
        tfRef={tfRef}
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
        cameraRestartDelay={cameraRestartDelay}
        setCameraRestartDelay={setCameraRestartDelay}
        addLog={addLog}
      />

      <div className="grid min-h-screen flex-1 place-items-center p-4 sm:p-6">
        <SortVisionClient
          model={model}
          appStatus={appStatus}
          setAppStatus={setAppStatus}
          isTestMode={isTestMode}
          wakeLockEnabled={wakeLockEnabled}
          autoCaptureEnabled={autoCaptureEnabled}
          autoSortEnabled={autoSortEnabled}
          autoFlashEnabled={autoFlashEnabled}
          cameraRestartDelay={cameraRestartDelay}
          tmImageRef={tmImageRef}
          tfRef={tfRef}
          logs={logs}
          setLogs={setLogs}
          addLog={addLog}
        />
      </div>
    </>
  );
}
