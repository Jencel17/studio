
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

import SortVisionClient from "@/components/sort-vision-client";
import SortVisionSettings from "@/components/sort-vision-settings";
import SplashScreen from "@/components/splash-screen";
import { AppStatus, LogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { Loader2 } from "lucide-react";

export default function SortVision() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(undefined);

    const [isTestMode, setIsTestMode] = usePersistentState('isTestMode', false);
    const [wakeLockEnabled, setWakeLockEnabled] = usePersistentState('wakeLockEnabled', false);
    const [autoCaptureEnabled, setAutoCaptureEnabled] = usePersistentState('autoCaptureEnabled', false);
    const [autoSortEnabled, setAutoSortEnabled] = usePersistentState('autoSortEnabled', false);
    const [autoFlashEnabled, setAutoFlashEnabled] = usePersistentState('autoFlashEnabled', false);
    const [confidenceThreshold, setConfidenceThreshold] = usePersistentState('confidenceThreshold', 0.8);

    const [logs, setLogs] = useState<LogEntry[]>([]);

    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const authCookie = Cookies.get('auth');
        if (authCookie === 'true') {
            setIsAuthenticated(true);
        } else {
            // Set to false to trigger the redirect below, but only if the cookie is missing.
            setIsAuthenticated(false);
        }
    }, []);

    useEffect(() => {
        // This effect runs separately to handle redirection once the auth state is determined.
        if (isAuthenticated === false) {
            router.push('/login');
        }
    }, [isAuthenticated, router]);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [...prevLogs, newLog].slice(-100));
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return;

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
    }, [addLog, toast, isAuthenticated]);

    // Show a loading screen while we check for the cookie.
    if (isAuthenticated === undefined) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="mt-4 text-muted-foreground">Verifying authentication...</p>
            </div>
        );
    }

    // If not authenticated, we will be redirected by the effect above. Return null to avoid flashing content.
    if (!isAuthenticated) {
        return null;
    }

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
                confidenceThreshold={confidenceThreshold}
                setConfidenceThreshold={setConfidenceThreshold}
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
                    confidenceThreshold={confidenceThreshold}
                    setConfidenceThreshold={setConfidenceThreshold}
                    tmImageRef={tmImageRef}
                    logs={logs}
                    setLogs={setLogs}
                    addLog={addLog}
                />
            </main>
        </div>
    );
}
