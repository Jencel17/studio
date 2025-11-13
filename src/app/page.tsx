
"use client";

import { useState, useRef, useEffect, useCallback, MutableRefObject } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";

import SortVisionClient from "@/components/sort-vision-client";
import SortVisionSettings from "@/components/sort-vision-settings";
import { AppStatus, LogEntry } from "@/lib/types";

export default function SortVision() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    
    const [esp32Ip, setEsp32Ip] = useState("http://192.168.4.1");
    const [isTestMode, setIsTestMode] = useState(false);
    const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
    const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
    const [cameraRestartDelay, setCameraRestartDelay] = useState(3);
    
    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, 100));
    }, []);

    return (
    <>
      <SortVisionSettings 
        setModel={setModel}
        setAppStatus={setAppStatus}
        addLog={addLog}
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
        cameraRestartDelay={cameraRestartDelay}
        setCameraRestartDelay={setCameraRestartDelay}
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
          addLog={addLog}
          logs={logs}
          setLogs={setLogs}
          cameraRestartDelay={cameraRestartDelay}
          tmImageRef={tmImageRef}
          tfRef={tfRef}
        />
      </div>
    </>
  );
}
