
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSummaryStats, getAllTrainingImages, clearAllTrainingImages, resetAllStats, type SummaryStats, type TrainingImage } from "@/lib/stats-db";
import { getMaterialConfig, getCategoryLabel } from "@/lib/material-config";
import { cn } from "@/lib/utils";
import { RefreshCw, Download, Trash2, BarChart3, CheckCircle, XCircle, Image, TrendingUp, Users, ShieldCheck, User, Radio, Activity, ArrowRightLeft, Leaf, Cpu, Ban, Loader2, Calendar, ListOrdered } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { useAuth, type UserRole } from "@/contexts/auth-context";
import { subscribeToLiveDetection, subscribeToStats, type LiveDetectionState, sendManualSortCommand, subscribeToManualSortCommand, type ManualSortCommand, type SyncedDailyStats } from "@/lib/firestore-sync";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AdminDashboardProps {
    addLog: (message: string) => void;
}

export default function AdminDashboard({ addLog }: AdminDashboardProps) {
    const [stats, setStats] = useState<SummaryStats | null>(null);
    const [dailyData, setDailyData] = useState<SyncedDailyStats>({});
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [users, setUsers] = useState<{ uid: string; email: string; role: UserRole; createdAt: Date }[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [liveDetection, setLiveDetection] = useState<LiveDetectionState | null>(null);
    const [lastSortCommand, setLastSortCommand] = useState<ManualSortCommand | null>(null);
    const [isSendingSort, setIsSendingSort] = useState(false);
    const { toast } = useToast();
    const { getAllUsers, setUserRole, user: currentUser } = useAuth();

    // Load only training image count from local IndexedDB (images are always local)
    const refreshTrainingImageCount = useCallback(async () => {
        try {
            const summaryStats = await getSummaryStats();
            setStats(prev => prev
                ? { ...prev, trainingImagesCount: summaryStats.trainingImagesCount }
                : summaryStats
            );
        } catch (e) {
            console.error("Failed to load training image count:", e);
        }
    }, []);

    useEffect(() => {
        refreshTrainingImageCount();
    }, [refreshTrainingImageCount]);

    // Load users
    const loadUsers = useCallback(async () => {
        setIsLoadingUsers(true);
        try {
            const allUsers = await getAllUsers();
            setUsers(allUsers);
        } catch (e) {
            console.error("Failed to load users:", e);
        } finally {
            setIsLoadingUsers(false);
        }
    }, [getAllUsers]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    // Subscribe to live detection
    useEffect(() => {
        const unsubscribe = subscribeToLiveDetection((state) => {
            setLiveDetection(state);
        });
        return () => unsubscribe();
    }, []);

    // Subscribe to manual sort command status
    useEffect(() => {
        const unsubscribe = subscribeToManualSortCommand((cmd) => {
            setLastSortCommand(cmd);
        });
        return () => unsubscribe();
    }, []);

    // Subscribe to real-time stats from Firestore (primary source for admin)
    useEffect(() => {
        const unsubscribe = subscribeToStats((data) => {
            if (data.dailyStats) {
                setDailyData(data.dailyStats);
                setSelectedDate(prev => {
                    if (prev && data.dailyStats![prev]) return prev;
                    const dates = Object.keys(data.dailyStats!);
                    if (dates.length > 0) return dates.sort().reverse()[0];
                    return new Date().toISOString().split('T')[0];
                });
            }

            if (data.categoryStats || data.dailyStats) {
                const categoryBreakdown = data.categoryStats
                    ? Object.entries(data.categoryStats).map(([category, s]) => ({
                        category,
                        count: s.count,
                        correctCount: s.correctCount,
                        incorrectCount: s.incorrectCount,
                        lastUpdated: s.lastUpdated ? new Date(s.lastUpdated) : new Date()
                    }))
                    : [];

                const totalSorted = categoryBreakdown.reduce((sum, c) => sum + c.count, 0);
                const totalCorrect = categoryBreakdown.reduce((sum, c) => sum + c.correctCount, 0);
                const totalIncorrect = categoryBreakdown.reduce((sum, c) => sum + c.incorrectCount, 0);
                const accuracyRate = totalSorted > 0 ? (totalCorrect / totalSorted) * 100 : 0;

                setStats(prev => ({
                    totalSorted,
                    totalCorrect,
                    totalIncorrect,
                    accuracyRate,
                    categoryBreakdown,
                    trainingImagesCount: prev?.trainingImagesCount || 0
                }));
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleToggleRole = async (uid: string, currentRole: UserRole) => {
        const newRole: UserRole = currentRole === 'admin' ? 'user' : 'admin';
        try {
            await setUserRole(uid, newRole);
            toast({ title: 'Role Updated', description: `User role changed to ${newRole}.` });
            loadUsers();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const handleExportTrainingImages = async () => {
        setIsExporting(true);
        try {
            const images = await getAllTrainingImages();

            if (images.length === 0) {
                toast({ title: "No Images", description: "No training images saved locally." });
                setIsExporting(false);
                return;
            }

            const zip = new JSZip();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            // Group images by corrected label
            const byCategory: Record<string, TrainingImage[]> = {};
            images.forEach(img => {
                const key = img.correctedTo;
                if (!byCategory[key]) byCategory[key] = [];
                byCategory[key].push(img);
            });

            // Add images to zip, organized by folder
            for (const [category, categoryImages] of Object.entries(byCategory)) {
                categoryImages.forEach((img, index) => {
                    const base64Data = img.imageData.split(',')[1];
                    zip.file(`${category}/${category}_${index + 1}.jpg`, base64Data, { base64: true });
                });
            }

            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `all-training-images-${timestamp}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            addLog(`Exported ${images.length} training images.`);
            toast({ title: "Export Complete", description: `${images.length} images exported.` });
        } catch (e: any) {
            console.error("Export failed:", e);
            toast({ variant: "destructive", title: "Export Failed", description: e.message });
        } finally {
            setIsExporting(false);
        }
    };

    const handleClearTrainingImages = async () => {
        if (!window.confirm("Are you sure you want to delete ALL training images? This cannot be undone.")) {
            return;
        }
        try {
            await clearAllTrainingImages();
            addLog("Cleared all training images from local storage.");
            toast({ title: "Cleared", description: "All training images have been deleted." });
            refreshTrainingImageCount();
        } catch (e: any) {
            console.error("Clear failed:", e);
            toast({ variant: "destructive", title: "Clear Failed", description: e.message });
        }
    };

    const handleResetAllStats = async () => {
        if (!window.confirm("Are you sure you want to completely reset all analytics? All history will be lost.")) {
            return;
        }
        try {
            await resetAllStats();
            localStorage.setItem('totalItemsSorted', '0');
            addLog("Reset all statistics.");
            toast({ title: "Stats Reset", description: "All statistics have been reset to zero." });
            refreshTrainingImageCount();
        } catch (e: any) {
            console.error("Reset failed:", e);
            toast({ variant: "destructive", title: "Reset Failed", description: e.message });
        }
    };

    const handleManualSort = async (category: string) => {
        setIsSendingSort(true);
        try {
            await sendManualSortCommand(category);
            addLog(`Manual sort command sent: ${category.toUpperCase()}`);
            toast({ title: "Command Sent", description: `Manual sort: ${category}` });
        } catch (e: any) {
            console.error("Manual sort failed:", e);
            toast({ variant: "destructive", title: "Sort Failed", description: e.message });
        } finally {
            setIsSendingSort(false);
        }
    };

    if (isLoading || !stats) {
        return (
            <div className="flex items-center justify-center p-12">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Column 1: Stats Summary */}
            <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
                        <CardHeader className="pb-2 p-4">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-2">
                                <Activity className="h-3 w-3" /> Total Items
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <p className="text-3xl font-bold">{stats.totalSorted}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                        <CardHeader className="pb-2 p-4">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-500 flex items-center gap-2">
                                <TrendingUp className="h-3 w-3" /> Accuracy
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <p className="text-3xl font-bold">{stats.accuracyRate.toFixed(1)}%</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                        <CardHeader className="pb-2 p-4">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-green-500 flex items-center gap-2">
                                <CheckCircle className="h-3 w-3" /> Correct
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <p className="text-3xl font-bold">{stats.totalCorrect}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
                        <CardHeader className="pb-2 p-4">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-2">
                                <XCircle className="h-3 w-3" /> Incorrect
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <p className="text-3xl font-bold">{stats.totalIncorrect}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Daily Analytics */}
                <Card className="border-white/5 bg-background/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" /> Daily Analytics
                        </CardTitle>
                        <Select value={selectedDate} onValueChange={setSelectedDate}>
                            <SelectTrigger className="w-[140px] h-8 text-xs bg-black/20 border-white/10">
                                <SelectValue placeholder="Select date" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(dailyData).length > 0 ? (
                                    Object.keys(dailyData).sort().reverse().map(date => (
                                        <SelectItem key={date} value={date}>{date === new Date().toISOString().split('T')[0] ? "Today" : date}</SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value={selectedDate}>Today</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent>
                        {dailyData[selectedDate] ? (
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                    <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Total Sorted</p>
                                    <p className="text-2xl font-bold">{dailyData[selectedDate].totalSorted}</p>
                                </div>
                                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-500">
                                    <p className="text-xs uppercase font-bold mb-1">Correct</p>
                                    <p className="text-2xl font-bold">{dailyData[selectedDate].correctCount}</p>
                                </div>
                                <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-500">
                                    <p className="text-xs uppercase font-bold mb-1">Incorrect</p>
                                    <p className="text-2xl font-bold">{dailyData[selectedDate].incorrectCount}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-6">No data recorded for this date.</p>
                        )}
                    </CardContent>
                </Card>

                {/* Category Breakdown */}
                <Card className="border-white/5 bg-background/50">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" /> Category Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {stats.categoryBreakdown.filter(cat => {
                            const label = getCategoryLabel(cat.category).toLowerCase();
                            return ["biodegradable", "non-biodegradable", "e-waste"].includes(label);
                        }).length > 0 ? (
                            stats.categoryBreakdown.filter(cat => {
                                const label = getCategoryLabel(cat.category).toLowerCase();
                                return ["biodegradable", "non-biodegradable", "e-waste"].includes(label);
                            }).map((cat) => {
                                const config = getMaterialConfig(cat.category);
                                const percentage = stats.totalSorted > 0 ? (cat.count / stats.totalSorted) * 100 : 0;
                                return (
                                    <div key={cat.category} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{config.icon}</span>
                                                <span className="capitalize font-semibold">{cat.category}</span>
                                            </div>
                                            <span className="font-mono text-muted-foreground">{cat.count} items ({percentage.toFixed(0)}%)</span>
                                        </div>
                                        <Progress value={percentage} className={cn("h-2.5", config.color)} />
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-sm text-muted-foreground col-span-2 text-center py-4">No data available.</p>
                        )}
                    </CardContent>
                </Card>

                {/* Training Data Management */}
                <Card className="border-white/5 bg-background/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                            <Image className="h-4 w-4 text-primary" /> Training Dataset
                        </CardTitle>
                        <div className="text-2xl font-bold">{stats.trainingImagesCount}</div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-3">
                            <Button
                                onClick={handleExportTrainingImages}
                                variant="secondary"
                                className="flex-1 font-bold"
                                disabled={isExporting || stats.trainingImagesCount === 0}
                            >
                                {isExporting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                                Export All Images (.zip)
                            </Button>
                            <Button
                                onClick={handleClearTrainingImages}
                                variant="outline"
                                className="text-rose-500 border-rose-500/20 hover:bg-rose-500/10"
                                disabled={stats.trainingImagesCount === 0}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3 text-center">
                            Training images are stored locally and should be exported periodically.
                        </p>
                    </CardContent>
                </Card>

                {/* Manual Sort Control */}
                <Card className="border-white/5 bg-background/50">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4 text-primary" /> Manual Sort
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-xs text-muted-foreground">
                            Send a sort command directly to the client device.
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            <Button
                                onClick={() => handleManualSort('biodegradable')}
                                disabled={isSendingSort}
                                className="flex flex-col items-center gap-1.5 h-auto py-3 bg-amber-600/10 hover:bg-amber-600/30 border border-amber-600/20 text-amber-500"
                                variant="outline"
                            >
                                {isSendingSort ? <Loader2 className="h-5 w-5 animate-spin" /> : <Leaf className="h-5 w-5" />}
                                <span className="text-[10px] font-bold uppercase">Bio</span>
                            </Button>
                            <Button
                                onClick={() => handleManualSort('e-waste')}
                                disabled={isSendingSort}
                                className="flex flex-col items-center gap-1.5 h-auto py-3 bg-purple-600/10 hover:bg-purple-600/30 border border-purple-600/20 text-purple-500"
                                variant="outline"
                            >
                                {isSendingSort ? <Loader2 className="h-5 w-5 animate-spin" /> : <Cpu className="h-5 w-5" />}
                                <span className="text-[10px] font-bold uppercase">E-Waste</span>
                            </Button>
                            <Button
                                onClick={() => handleManualSort('non-biodegradable')}
                                disabled={isSendingSort}
                                className="flex flex-col items-center gap-1.5 h-auto py-3 bg-slate-600/10 hover:bg-slate-600/30 border border-slate-600/20 text-slate-400"
                                variant="outline"
                            >
                                {isSendingSort ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ban className="h-5 w-5" />}
                                <span className="text-[10px] font-bold uppercase">Non-Bio</span>
                            </Button>
                        </div>
                        {lastSortCommand && (
                            <div className="flex items-center justify-between text-xs px-1 pt-1">
                                <span className="text-muted-foreground">Last: <span className="font-mono capitalize">{lastSortCommand.command}</span></span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full font-bold uppercase text-[10px]",
                                    lastSortCommand.status === 'acknowledged'
                                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                        : "bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse"
                                )}>
                                    {lastSortCommand.status}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Global Actions */}
                <div className="flex gap-4">
                    <Button onClick={refreshTrainingImageCount} variant="outline" className="flex-1">
                        <RefreshCw className="h-4 w-4 mr-2" /> Refresh All Data
                    </Button>
                    <Button
                        onClick={handleResetAllStats}
                        variant="outline"
                        className="text-amber-500 border-amber-500/20 hover:bg-amber-500/10"
                    >
                        <Trash2 className="h-4 w-4 mr-2" /> Reset Analytics
                    </Button>
                </div>
            </div>

            {/* Column 2: Right Sidebar info (Live & Users) */}
            <div className="space-y-6">
                {/* Live Detection State */}
                <Card className="border-white/5 bg-background/50 shadow-xl overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b border-white/5">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                            <Radio className="h-4 w-4 text-primary" /> Live Monitor
                            {liveDetection && (
                                <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] text-emerald-500 font-bold uppercase">Online</span>
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        {liveDetection ? (
                            <div className="space-y-4">
                                <div className="p-3 bg-muted/30 rounded-lg border border-white/5">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Prediction</p>
                                            <p className="text-xl font-bold capitalize">{liveDetection.currentPrediction || 'No Object'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Confidence</p>
                                            <p className="text-xl font-bold">{(liveDetection.confidence * 100).toFixed(1)}%</p>
                                        </div>
                                    </div>
                                    <Progress value={liveDetection.confidence * 100} className="h-1.5 mt-2" />
                                </div>

                                <div className="space-y-2 px-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">App Status</span>
                                        <span className="font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">{liveDetection.appStatus}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Device ID</span>
                                        <span className="font-mono">{liveDetection.deviceId}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Last Heartbeat</span>
                                        <span>{new Date(liveDetection.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 space-y-2">
                                <Radio className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                                <p className="text-sm text-muted-foreground">Waiting for client to connect...</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recently Sorted Items */}
                {liveDetection?.recentSorts && liveDetection.recentSorts.length > 0 && (
                    <Card className="border-white/5 bg-background/50 shadow-xl overflow-hidden">
                        <CardHeader className="bg-primary/5 border-b border-white/5 pb-3">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                <ListOrdered className="h-4 w-4 text-primary" /> Recently Sorted
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-white/5">
                                {liveDetection.recentSorts.map((sort, index) => {
                                    const config = getMaterialConfig(sort);
                                    const isBiodegradable = sort.toLowerCase() === "paper" || sort.toLowerCase() === "biodegradable";
                                    const isNonBio = sort.toLowerCase() === "metal" || sort.toLowerCase() === "non-biodegradable";
                                    const isEWaste = sort.toLowerCase() === "plastic" || sort.toLowerCase() === "e-waste";
                                    return (
                                        <div key={index} className="flex items-center gap-3 p-3 px-4 hover:bg-white/5 transition-colors">
                                            <div className={cn("h-8 w-8 rounded-full flex items-center justify-center border bg-muted/50", config.color.replace('text-', 'border-').replace('text-white', 'border-white/20'))}>
                                                <span className={cn("text-base", config.color)}>{config.icon}</span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold truncate leading-none mb-1 capitalize">{sort}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                                                    {isBiodegradable ? "Biodegradable" : isNonBio ? "Non-Biodegradable" : isEWaste ? "E-Waste" : sort}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* User Management */}
                <Card className="border-white/5 bg-background/50 shadow-xl">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" /> Users
                        </CardTitle>
                        <Button onClick={loadUsers} variant="ghost" size="icon" className="h-8 w-8" disabled={isLoadingUsers}>
                            <RefreshCw className={cn("h-3 w-3", isLoadingUsers && "animate-spin")} />
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto px-4 pb-4">
                            {users.map((u) => (
                                <div key={u.uid} className="py-4 last:pb-0 first:pt-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={cn(
                                                "h-8 w-8 rounded-full flex items-center justify-center border",
                                                u.role === 'admin' ? "bg-primary/10 border-primary/20" : "bg-muted border-white/5"
                                            )}>
                                                {u.role === 'admin' ? (
                                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                                ) : (
                                                    <User className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold truncate leading-none mb-1">{u.email}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{u.role}</p>
                                            </div>
                                        </div>
                                        {u.uid !== currentUser?.uid && (
                                            <Button
                                                onClick={() => handleToggleRole(u.uid, u.role)}
                                                variant="secondary"
                                                size="sm"
                                                className="h-7 text-[10px] uppercase font-bold"
                                            >
                                                {u.role === 'admin' ? 'Demote' : 'Promote'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {users.length === 0 && !isLoadingUsers && (
                                <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
