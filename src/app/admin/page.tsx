"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type * as tmImage from "@teachablemachine/image";
import type * as tf from "@tensorflow/tfjs";
import { useRouter } from 'next/navigation';

import SortVisionClient from "@/components/sort-vision-client";
import SortVisionSettings from "@/components/sort-vision-settings";
import SplashScreen from "@/components/splash-screen";
import ErrorBoundary from "@/components/error-boundary";
import AdminDashboard from "@/components/admin-dashboard";
import { AppStatus, LogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Loader2, ShieldAlert, Zap, BarChart3, LayoutDashboard, Settings } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

type AdminTab = "control" | "dashboard";

export default function AdminPage() {
    const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
    const [appStatus, setAppStatus] = useState<AppStatus>("LOADING_LIBS");
    const [activeTab, setActiveTab] = useState<AdminTab>("control");

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

    const SettingsComponent = (
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
    );

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
        <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
            {/* Responsive Sidebar (Handles both Mobile Sheet and Desktop Sidebar) */}
            {SettingsComponent}

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header with Tabs */}
                <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-background/50 backdrop-blur-md z-10 sticky top-0">
                    <div className="flex items-center gap-4">
                        {/* Mobile Settings Trigger */}
                        <div className="md:hidden">
                            <SidebarTrigger />
                        </div>

                        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">
                            Admin Panel
                        </h1>
                    </div>

                    <div className="flex bg-muted/30 p-1 rounded-lg scale-90 md:scale-100 origin-right">
                        <button
                            onClick={() => setActiveTab("control")}
                            className={cn(
                                "flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all",
                                activeTab === "control"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Zap className="h-3 w-3 md:h-4 md:w-4" />
                            Control
                        </button>
                        <button
                            onClick={() => setActiveTab("dashboard")}
                            className={cn(
                                "flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all",
                                activeTab === "dashboard"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
                            Analytics
                        </button>
                    </div>

                    <div className="hidden md:flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider">System Live</span>
                    </div>
                </header>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {activeTab === "control" ? (
                        <div className="max-w-6xl mx-auto h-full flex flex-col">
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
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold">System Analytics</h2>
                                    <p className="text-muted-foreground">Monitor performance, training data, and users.</p>
                                </div>
                            </div>

                            <ErrorBoundary fallbackTitle="Dashboard Error">
                                <AdminDashboard addLog={addLog} />
                            </ErrorBoundary>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
