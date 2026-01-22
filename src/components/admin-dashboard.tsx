
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSummaryStats, getAllTrainingImages, clearAllTrainingImages, resetAllStats, type SummaryStats, type TrainingImage } from "@/lib/stats-db";
import { getMaterialConfig } from "@/lib/material-config";
import { cn } from "@/lib/utils";
import { RefreshCw, Download, Trash2, BarChart3, CheckCircle, XCircle, Image, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import JSZip from "jszip";

interface AdminDashboardProps {
    addLog: (message: string) => void;
}

export default function AdminDashboard({ addLog }: AdminDashboardProps) {
    const [stats, setStats] = useState<SummaryStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const { toast } = useToast();

    const refreshStats = useCallback(async () => {
        setIsLoading(true);
        try {
            const summaryStats = await getSummaryStats();
            setStats(summaryStats);
        } catch (e) {
            console.error("Failed to load stats:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshStats();
    }, [refreshStats]);

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
        try {
            await clearAllTrainingImages();
            addLog("Cleared all training images from local storage.");
            toast({ title: "Cleared", description: "All training images have been deleted." });
            refreshStats();
        } catch (e: any) {
            console.error("Clear failed:", e);
            toast({ variant: "destructive", title: "Clear Failed", description: e.message });
        }
    };

    const handleResetAllStats = async () => {
        try {
            await resetAllStats();
            localStorage.setItem('totalItemsSorted', '0');
            addLog("Reset all statistics.");
            toast({ title: "Stats Reset", description: "All statistics have been reset to zero." });
            refreshStats();
        } catch (e: any) {
            console.error("Reset failed:", e);
            toast({ variant: "destructive", title: "Reset Failed", description: e.message });
        }
    };

    if (isLoading || !stats) {
        return (
            <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
                    <div className="flex items-center gap-2 text-emerald-500 mb-1">
                        <BarChart3 className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase">Total Sorted</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalSorted}</p>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                    <div className="flex items-center gap-2 text-blue-500 mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase">Accuracy</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.accuracyRate.toFixed(1)}%</p>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <div className="flex items-center gap-2 text-green-500 mb-1">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase">Correct</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalCorrect}</p>
                </Card>

                <Card className="p-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
                    <div className="flex items-center gap-2 text-rose-500 mb-1">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase">Incorrect</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.totalIncorrect}</p>
                </Card>
            </div>

            {/* Category Breakdown */}
            {stats.categoryBreakdown.length > 0 && (
                <Card className="p-4 border-white/10">
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">By Category</h4>
                    <div className="space-y-3">
                        {stats.categoryBreakdown.map((cat) => {
                            const config = getMaterialConfig(cat.category);
                            const percentage = stats.totalSorted > 0 ? (cat.count / stats.totalSorted) * 100 : 0;
                            return (
                                <div key={cat.category} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <span>{config.icon}</span>
                                            <span className="capitalize font-medium">{cat.category}</span>
                                        </div>
                                        <span className="text-muted-foreground">{cat.count}</span>
                                    </div>
                                    <Progress value={percentage} className={cn("h-2", config.color)} />
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Training Images */}
            <Card className="p-4 border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Image className="h-4 w-4" />
                        <span className="text-sm font-semibold uppercase tracking-wider">Training Images</span>
                    </div>
                    <span className="text-lg font-bold">{stats.trainingImagesCount}</span>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={handleExportTrainingImages}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={isExporting || stats.trainingImagesCount === 0}
                    >
                        {isExporting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                        Export All
                    </Button>
                    <Button
                        onClick={handleClearTrainingImages}
                        variant="outline"
                        size="sm"
                        className="text-rose-500 border-rose-500/50 hover:bg-rose-500/10"
                        disabled={stats.trainingImagesCount === 0}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </Card>

            {/* Actions */}
            <div className="flex gap-2">
                <Button onClick={refreshStats} variant="outline" size="sm" className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
                <Button
                    onClick={handleResetAllStats}
                    variant="outline"
                    size="sm"
                    className="text-amber-500 border-amber-500/50 hover:bg-amber-500/10"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset All
                </Button>
            </div>
        </div>
    );
}
