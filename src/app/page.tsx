
"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import type * as tmImage from "@teachablemachine/image";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { LogEntry } from "@/lib/types";

const SortVisionClient = dynamic(
  () => import("@/components/sort-vision-client"),
  { 
    ssr: false,
    loading: () => <div className="grid min-h-screen flex-1 place-items-center p-4 sm:p-6"><div className="w-full max-w-4xl p-4 sm:p-6"><Skeleton className="w-full h-[600px]" /></div></div>
  }
);


export type AppStatus = "AWAITING_MODEL" | "LOADING_LIBS" | "LIBS_LOADED"| "MODEL_LOADING" | "AWAITING_OBJECT" | "CONFIDENCE_TOO_LOW" | "READY_TO_SEND" | "CAMERA_CYCLING" | "COLLECTING_IMAGES" | "COOLDOWN";
const MAX_LOGS = 100;

export default function SortVisionPage() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [modelLabels, setModelLabels] = useState<string[]>([]);
    const [wakeLockRef, setWakeLockRef] = useState<WakeLockSentinel | null>(null);
    const [isWakeLockActive, setIsWakeLockActive] = useState(false);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, MAX_LOGS));
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef) {
          try {
            await wakeLockRef.release();
            setWakeLockRef(null);
            setIsWakeLockActive(false);
          } catch (error: any) {
            console.error("Could not release wake lock:", error);
          }
        }
      }, [wakeLockRef]);

    return (
        <SortVisionCore 
            model={model}
            setModel={setModel}
            modelLabels={modelLabels}
            setModelLabels={setModelLabels}
            appStatus={appStatus}
            setAppStatus={setAppStatus}
            wakeLockRef={wakeLockRef}
            setWakeLockRef={setWakeLockRef}
            isWakeLockActive={isWakeLockActive}
            setIsWakeLockActive={setIsWakeLockActive}
            addLog={addLog}
            logs={logs}
            setLogs={setLogs}
            releaseWakeLock={releaseWakeLock}
        />
    )
}

const SortVisionCore = dynamic(
  () => import("@/components/sort-vision-core"),
  { 
    ssr: false,
    loading: () => <div className="grid min-h-screen flex-1 place-items-center p-4 sm:p-6"><div className="w-full max-w-4xl p-4 sm:p-6"><Skeleton className="w-full h-[600px]" /></div></div>
  }
);

    