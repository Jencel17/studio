
"use client";

import { Badge } from "@/components/ui/badge";
import { Hourglass, Sparkles, CheckCircle, XCircle, TestTube, BluetoothConnected, BluetoothOff } from "lucide-react";
import { AppStatus, Prediction } from "@/lib/types";

type CommandStatus = {
    status: "IDLE" | "SUCCESS" | "ERROR";
    message: string;
};

interface StatusDisplayProps {
    appStatus: AppStatus;
    stablePrediction: Prediction | null;
    primaryPrediction: Prediction | null;
    isTestMode: boolean;
    isBtConnected: boolean;
    commandStatus: CommandStatus;
}

export default function StatusDisplay({
    appStatus,
    stablePrediction,
    primaryPrediction,
    isTestMode,
    isBtConnected,
    commandStatus,
}: StatusDisplayProps) {
    const getStatusText = () => {
        switch (appStatus) {
            case "AWAITING_MODEL": return "Awaiting Model";
            case "LOADING_LIBS": return "Loading AI libs...";
            case "MODEL_LOADING": return "Loading Model...";
            case "CAMERA_WARMING_UP": return "Camera Warming Up...";
            case "AWAITING_OBJECT":
                return stablePrediction ? `Confirming ${stablePrediction.className}...` : "Awaiting Object";
            case "CONFIDENCE_TOO_LOW": return "Confidence Too Low";
            case "CAMERA_CYCLING": return "Waiting for Sorter...";
            case "COLLECTING_IMAGES": return "Collecting Images...";
            case "COOLDOWN": return "Cooldown";
            case "AI_FALLBACK": return "AI Analyzing...";

            case "READY_TO_SEND":
                return `Sending: ${primaryPrediction?.className || '...'}`;
            default: return "Analyzing...";
        }
    };

    const getStatusBadgeVariant = () => {
        switch (appStatus) {
            case "READY_TO_SEND": return "default";
            case "COLLECTING_IMAGES": return "default";
            case "AWAITING_MODEL": return "secondary";
            case "COOLDOWN":
            case "LOADING_LIBS":
            case "MODEL_LOADING":
            case "CAMERA_CYCLING":
            case "CAMERA_WARMING_UP": return "secondary";
            case "CONFIDENCE_TOO_LOW": return "destructive";
            case "AI_FALLBACK": return "default";

            case "AWAITING_OBJECT":
                return stablePrediction ? "default" : "outline";
            default: return "outline";
        }
    };

    const isLoading = appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || appStatus === 'CAMERA_CYCLING' || appStatus === 'COLLECTING_IMAGES' || appStatus === 'COOLDOWN' || appStatus === 'CAMERA_WARMING_UP' || appStatus === 'AI_FALLBACK' || (appStatus === 'AWAITING_OBJECT' && !!stablePrediction);

    return (
        <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant={getStatusBadgeVariant()} className="text-xs">
                    {isLoading && <Hourglass className="h-3 w-3 mr-1 animate-spin" />}
                    {appStatus === 'AI_FALLBACK' && <Sparkles className="h-3 w-3 mr-1 animate-pulse" />}
                    {appStatus === 'ANALYZING_MATERIAL' && <Sparkles className="h-3 w-3 mr-1 animate-pulse" />}
                    {getStatusText()}
                </Badge>
                <Badge variant={isTestMode ? "default" : isBtConnected ? "default" : "destructive"} className="gap-2 text-xs">
                    {isTestMode ? <TestTube className="h-3 w-3" /> : isBtConnected ? <BluetoothConnected className="h-3 w-3" /> : <BluetoothOff className="h-3 w-3" />}
                    {isTestMode ? "Test Mode" : isBtConnected ? "Sorter Connected" : "Sorter Disconnected"}
                </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {commandStatus.status === 'IDLE' && <p>{commandStatus.message}</p>}
                {commandStatus.status === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {commandStatus.status === 'ERROR' && <XCircle className="h-4 w-4 text-red-500" />}
                <p className="truncate">{commandStatus.status !== 'IDLE' && commandStatus.message}</p>
            </div>
        </div>
    );
}
