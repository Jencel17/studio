
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

import ClientView from "@/components/client-view";
import SplashScreen from "@/components/splash-screen";
import ErrorBoundary from "@/components/error-boundary";
import { AppStatus, LogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

import { usePersistentState } from "@/hooks/use-persistent-state";
import { Loader2 } from "lucide-react";

export default function ClientPage() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(undefined);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // Shared state
    const [confidenceThreshold] = usePersistentState('confidenceThreshold', 0.8);
    const [autoSortEnabled] = usePersistentState('autoSortEnabled', false);

    const tmImageRef = useRef<typeof tmImage | null>(null);
    const tfRef = useRef<typeof tf | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const authCookie = Cookies.get('auth');
        if (authCookie === 'true') {
            setIsAuthenticated(true);
        } else {
            setIsAuthenticated(false);
        }
    }, []);

    useEffect(() => {
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
    }, [addLog, toast, isAuthenticated]);

    // Attempt to auto-load model from DB if SortVisionSettings isn't here to do it?
    // Wait, ClientPage doesn't have Settings.
    // The user said "Communication Protocol: This plan assumes ... synced via localStorage."
    // But `model` object cannot be synced via localStorage.
    // The model must be loaded into memory.
    // So the ClientPage must ALSO load the model.
    // How? Auto-load the "Default" model? Or prompt?
    // The prompt says "No Settings: User cannot change confidence threshold...".
    // But how do they get the model?
    // "Navigate to /admin, load the model... Open /client".
    // If they are in the same browser, IndexedDB is shared!
    // So I can auto-load the *most recent* model or a *specific* model from IndexedDB?
    // `saveModelToDb` allows saving. `getModelsFromDb` listing.
    // I should create a "Default" mechanism or just picking the first one.
    // Or I can add a simple "Select Model" overlay if none is loaded.
    // For now, I will try to auto-load the first available model from DB.

    /* Warning: I need to import DB functions from `@/lib/model-db`. */

    return (
        <div className="h-screen w-full bg-black">
            {isAuthenticated === undefined ? (
                <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
            ) : !isAuthenticated ? null : (
                appStatus === 'LOADING_LIBS' ? <SplashScreen /> : (
                    <ClientLoader
                        tmImageRef={tmImageRef}
                        setModel={setModel}
                        setAppStatus={setAppStatus}
                        model={model}
                    >
                        <ErrorBoundary fallbackTitle="Classification Error">
                            <ClientView
                                model={model}
                                appStatus={appStatus}
                                setAppStatus={setAppStatus}
                                tmImageRef={tmImageRef}
                                addLog={addLog}
                                confidenceThreshold={confidenceThreshold}
                                autoSortEnabled={autoSortEnabled}
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
    model
}: {
    children: React.ReactNode,
    tmImageRef: any,
    setModel: (m: any) => void,
    setAppStatus: (s: AppStatus) => void,
    model: any
}) {
    const [loadingMsg, setLoadingMsg] = useState("");

    useEffect(() => {
        const loadDefaultModel = async () => {
            if (model) return;
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
    }, [tmImageRef, model, setModel, setAppStatus]);

    if (!model) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-white space-y-4">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="text-lg font-medium">{loadingMsg || "Initializing..."}</p>
            </div>
        );
    }

    return <>{children}</>;
}
