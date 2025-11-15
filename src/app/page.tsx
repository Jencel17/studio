
"use client";

import { useState, useRef, useCallback } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";

import SortVisionClient from "@/components/sort-vision-client";
import SortVisionSettings from "@/components/sort-vision-settings";
import { AppStatus, LogEntry } from "@/lib/types";

export default function SortVision() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    
    const [esp32Ip, setEsp32Ip] = useState("http://192.168.4.1");
    const [isTestMode, setIsTestMode] = useState(false);
    const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
    const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
    const [autoFlashEnabled, setAutoFlashEnabled] = useState(false);
    const [cameraRestartDelay, setCameraRestartDelay] = useState(3);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    
    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [...prevLogs, newLog].slice(-100));
    }, []);


    return (
    <>
      <SortVisionSettings 
        model={model}
        setModel={setModel}
        setAppStatus={setAppStatus}
        tmImageRef={tmImageRef}
        tfRef={tfRef}
        esp32Ip={esp32Ip}
        setEsp32Ip={setEsp32Ip}
        isTestMode={isTestMode}
        setIsTestMode={setIsTestMode}
        wakeLockEnabled={wakeLockEnabled}
        setWakeLockEnabled={setWakeLockEnabled}
        autoCaptureEnabled={autoCaptureEnabled}
        setAutoCaptureEnabled={setAutoCaptureEnabled}
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
          esp32Ip={esp32Ip}
          isTestMode={isTestMode}
          wakeLockEnabled={wakeLockEnabled}
          autoCaptureEnabled={autoCaptureEnabled}
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
