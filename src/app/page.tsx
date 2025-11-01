
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type * as tmImage from "@teachablemachine/image";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { LogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

export type AppStatus = "AWAITING_MODEL" | "LOADING_LIBS" | "LIBS_LOADED"| "MODEL_LOADING" | "AWAITING_OBJECT" | "CONFIDENCE_TOO_LOW" | "READY_TO_SEND" | "CAMERA_CYCLING" | "COLLECTING_IMAGES" | "COOLDOWN";
const MAX_LOGS = 100;

const SortVisionCore = dynamic(
  () => import("@/components/sort-vision-core"),
  { 
    ssr: false,
    loading: () => <div className="grid min-h-screen flex-1 place-items-center p-4 sm:p-6"><div className="w-full max-w-4xl p-4 sm:p-6"><Skeleton className="w-full h-[600px]" /></div></div>
  }
);


export default function SortVisionLoader() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [modelLabels, setModelLabels] = useState<string[]>([]);
    const [wakeLockRef, setWakeLockRef] = useState<WakeLockSentinel | null>(null);
    const [isWakeLockActive, setIsWakeLockActive] = useState(false);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [libsLoaded, setLibsLoaded] = useState(false);

    const { toast } = useToast();

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, MAX_LOGS));
    }, []);

    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof import("@tensorflow/tfjs") | null>(null);

    const loadAiLibraries = useCallback(async () => {
        if (tmImageRef.current && tfRef.current) {
          addLog("AI libraries already loaded.");
          return true;
        }
        addLog("Loading AI libraries...");
        setAppStatus("LOADING_LIBS");
        try {
          const [tm, tf] = await Promise.all([
            import("@teachablemachine/image"),
            import("@tensorflow/tfjs"),
          ]);
          tmImageRef.current = tm;
          tfRef.current = tf;
          addLog("AI libraries loaded successfully.");
          setAppStatus("AWAITING_MODEL");
          setLibsLoaded(true);
          return true;
        } catch (error: any) {
          console.error("Failed to load AI libraries:", error);
          toast({
            variant: "destructive",
            title: "Library Load Error",
            description: "Could not load core AI libraries. Please refresh the page.",
          });
          addLog("FATAL: Failed to load AI libraries.");
          setLibsLoaded(false);
          return false;
        }
      }, [toast, setAppStatus, addLog]);

    useEffect(() => {
        if(!libsLoaded) {
            loadAiLibraries();
        }
    }, [libsLoaded, loadAiLibraries]);

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
            libsLoaded={libsLoaded}
            tmImageRef={tmImageRef}
            tfRef={tfRef}
        />
    )
}
