
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";
import { useRouter } from 'next/navigation';

import ClientView from "@/components/client-view";
import SplashScreen from "@/components/splash-screen";
import ErrorBoundary from "@/components/error-boundary";
import { AppStatus, LogEntry, ROI, DEFAULT_ROI } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

import { usePersistentState } from "@/hooks/use-persistent-state";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export default function ClientPage() {
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const modelRef = useRef<tmImage.CustomMobileNet | null>(null);

    const getModel = useCallback(() => modelRef.current, []);
    const setModelWrapper = useCallback((m: tmImage.CustomMobileNet | null) => {
        modelRef.current = m;
        setIsModelLoaded(!!m);
    }, []);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const { user, loading } = useAuth();

    // Shared state
    const [confidenceThreshold] = usePersistentState('confidenceThreshold', 0.8);
    const [autoSortEnabled] = usePersistentState('autoSortEnabled', false);
    const [mirrorCameraEnabled] = usePersistentState('mirrorCameraEnabled', false);
    const [wakeLockEnabled] = usePersistentState('wakeLockEnabled', false);
    const [autoFlashEnabled] = usePersistentState('autoFlashEnabled', false);
    const [roi] = usePersistentState<ROI>('roi', DEFAULT_ROI);

    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [loading, user, router]);

    // Auto-request fullscreen on first tap (browser requires user gesture)
    useEffect(() => {
        if (!user) return;

        const requestFullscreen = () => {
            const el = document.documentElement;
            if (!document.fullscreenElement) {
                el.requestFullscreen?.().catch(() => {
                    // Fullscreen not supported or blocked — silently ignore
                });
            }
            // Only need one tap
            document.removeEventListener('click', requestFullscreen);
            document.removeEventListener('touchstart', requestFullscreen);
        };

        document.addEventListener('click', requestFullscreen, { once: true });
        document.addEventListener('touchstart', requestFullscreen, { once: true });

        return () => {
            document.removeEventListener('click', requestFullscreen);
            document.removeEventListener('touchstart', requestFullscreen);
        };
    }, [user]);

    const addLog = useCallback((message: string) => {
        const newLog: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            message,
        };
        setLogs((prevLogs) => [...prevLogs, newLog].slice(-100));
    }, []);

    useEffect(() => {
        if (!user) return;

        const loadAiLibraries = async () => {
            if (tmImageRef.current && tfRef.current) {
                // Already loaded
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
                addLog("AI libraries loaded.");
                setAppStatus("AWAITING_MODEL");
            } catch (error: any) {
                console.error("Failed to load AI libraries:", error);
                toast({
                    variant: "destructive",
                    title: "Library Load Error",
                    description: "Could not load AI libraries. Refresh required.",
                });
                addLog("FATAL: Failed to load AI libraries.");
            }
        };

        loadAiLibraries();
    }, [addLog, toast, user]);

    return (
        <div className="h-screen w-full bg-black">
            {loading ? (
                <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
            ) : !user ? null : (
                appStatus === 'LOADING_LIBS' ? <SplashScreen /> : (
                    <ClientLoader
                        tmImageRef={tmImageRef}
                        setModel={setModelWrapper}
                        setAppStatus={setAppStatus}
                        hasModel={isModelLoaded}
                    >
                        <ErrorBoundary fallbackTitle="Classification Error">
                            <ClientView
                                getModel={getModel}
                                appStatus={appStatus}
                                setAppStatus={setAppStatus}
                                tmImageRef={tmImageRef}
                                addLog={addLog}
                                confidenceThreshold={confidenceThreshold}
                                autoSortEnabled={autoSortEnabled}
                                mirrorCameraEnabled={mirrorCameraEnabled}
                                wakeLockEnabled={wakeLockEnabled}
                                autoFlashEnabled={autoFlashEnabled}
                                roi={roi}
                            />
                        </ErrorBoundary>
                    </ClientLoader>
                )
            )}
        </div>
    );
}

// Helper to auto-load model
import { getModelsFromDb, getModelFromDb } from "@/lib/model-db";

function ClientLoader({
    children,
    tmImageRef,
    setModel,
    setAppStatus,
    hasModel
}: {
    children: React.ReactNode,
    tmImageRef: any,
    setModel: (m: any) => void,
    setAppStatus: (s: AppStatus) => void,
    hasModel: boolean
}) {
    const [loadingMsg, setLoadingMsg] = useState("");

    useEffect(() => {
        const loadDefaultModel = async () => {
            if (hasModel) return;
            if (!tmImageRef.current) return;

            setLoadingMsg("Checking for saved models...");
            try {
                const models = await getModelsFromDb();
                if (models.length > 0) {
                    const targetName = models[0].name;
                    setLoadingMsg(`Loading model: ${targetName}...`);

                    const fullModel = await getModelFromDb(targetName);
                    if (fullModel) {
                        const loaded = await tmImageRef.current.loadFromFiles(fullModel.model, fullModel.weights, fullModel.metadata);
                        setModel(loaded);
                        setAppStatus("AWAITING_OBJECT");
                    } else {
                        setLoadingMsg("Error: Model files not found.");
                    }
                } else {
                    setLoadingMsg("No models found. Please upload one in Admin panel.");
                }
            } catch (e) {
                console.error(e);
                setLoadingMsg("Error loading model.");
            }
        };

        loadDefaultModel();
    }, [tmImageRef, hasModel, setModel, setAppStatus]);

    if (!hasModel) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-white space-y-4">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="text-lg font-medium">{loadingMsg || "Initializing..."}</p>
            </div>
        );
    }

    return <>{children}</>;
}
