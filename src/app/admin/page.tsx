"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";
import { useRouter } from 'next/navigation';

import SortVisionClient from "@/components/sort-vision-client";
import SortVisionSettings from "@/components/sort-vision-settings";
import SplashScreen from "@/components/splash-screen";
import ErrorBoundary from "@/components/error-boundary";
import { AppStatus, LogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export default function AdminPage() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");

    const { user, userRole, loading } = useAuth();

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
        if (!loading && !user) {
            router.push('/login');
        }
    }, [loading, user, router]);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [...prevLogs, newLog].slice(-100));
    }, []);

    useEffect(() => {
        if (!user || userRole !== 'admin') return;

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
    }, [addLog, toast, user, userRole]);

    if (loading) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="mt-4 text-muted-foreground">Verifying authentication...</p>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    // Non-admin users see access denied
    if (userRole !== 'admin') {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground gap-4">
                <ShieldAlert className="h-16 w-16 text-destructive" />
                <h2 className="text-2xl font-bold">Access Denied</h2>
                <p className="text-muted-foreground">You need admin privileges to access this page.</p>
                <button
                    onClick={() => router.push('/')}
                    className="text-primary hover:underline"
                >
                    Go back to home
                </button>
            </div>
        );
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
                <ErrorBoundary fallbackTitle="Classification Error">
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
                </ErrorBoundary>
            </main>
        </div>
    );
}
