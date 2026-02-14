
"use client";

import type * as tmImage from "@teachablemachine/image";
import { Progress } from "@/components/ui/progress";
import { CameraOff, AlertTriangle, Upload, Hourglass, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AppStatus, Prediction } from "@/lib/types";
import type { DetectionState } from "@/lib/detection";

const IMAGE_CAPTURE_COUNT = 20;

interface PredictionDisplayProps {
    isCameraOn: boolean;
    hasCameraPermission: boolean;
    countdown: number;
    appStatus: AppStatus;
    isCollectingImages: boolean;
    collectedImages: string[];
    model: tmImage.CustomMobileNet | null;
    detectionState: DetectionState;
    primaryPrediction: Prediction | null;
    stablePrediction: Prediction | null;
}

export default function PredictionDisplay({
    isCameraOn,
    hasCameraPermission,
    countdown,
    appStatus,
    isCollectingImages,
    collectedImages,
    model,
    detectionState,
    primaryPrediction,
    stablePrediction,
}: PredictionDisplayProps) {
    const renderContent = () => {
        if (!isCameraOn) {
            if (!hasCameraPermission) {
                return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-4 text-center">
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Camera Access Required</AlertTitle>
                            <AlertDescription>
                                Please allow camera access in your browser settings to use this feature.
                            </AlertDescription>
                        </Alert>
                    </div>
                );
            }
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <CameraOff className="h-16 w-16 text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Camera is off</p>
                </div>
            );
        }

        if (countdown > 0) {
            return <h3 className="text-6xl font-bold text-white drop-shadow-lg animate-ping">{countdown}</h3>;
        }

        if (appStatus === 'CAMERA_WARMING_UP') {
            return (
                <div className="flex items-center gap-2">
                    <Hourglass className="h-6 w-6 text-white animate-spin" />
                    <h3 className="text-xl font-bold text-white drop-shadow-lg">
                        Warming up...
                    </h3>
                </div>
            );
        }

        if (isCollectingImages) {
            return (
                <div className="w-full max-w-xs text-center">
                    <p className="text-lg text-white/90 shadow-md mb-2">Capturing...</p>
                    <Progress value={(collectedImages.length / IMAGE_CAPTURE_COUNT) * 100} className="h-2 w-full bg-white/30" />
                </div>
            );
        }

        if (appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' || (!model && appStatus !== "AWAITING_OBJECT")) {
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Upload className="h-16 w-16 text-muted-foreground animate-pulse" />
                    <p className="mt-2 text-muted-foreground">{appStatus === 'LOADING_LIBS' || appStatus === 'MODEL_LOADING' ? 'Loading Model...' : 'Please load a model from settings.'}</p>
                </div>
            );
        }

        if (appStatus === 'ANALYZING_MATERIAL') {
            return (
                <div className="flex items-center gap-2">
                    <Sparkles className="h-6 w-6 text-blue-400 animate-pulse" />
                    <h3 className="text-xl font-bold text-blue-400 drop-shadow-lg">
                        Analyzing Material...
                    </h3>
                </div>
            );
        }

        switch (detectionState) {
            case "SINGLE_OBJECT":
                if (primaryPrediction) {
                    return (
                        <>
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                                {primaryPrediction.className}
                            </h3>
                            <div className="flex items-center gap-2">
                                <p className="text-sm text-white/90 drop-shadow-md">
                                    Confidence:
                                </p>
                                <Progress value={primaryPrediction.probability * 100} className="h-2 w-24 bg-white/30" />
                                <span className="text-sm font-semibold text-white">
                                    {(primaryPrediction.probability * 100).toFixed(0)}%
                                </span>
                            </div>
                        </>
                    );
                } else if (stablePrediction) {
                    return (
                        <div className="flex items-center gap-2">
                            <Hourglass className="h-6 w-6 text-white animate-spin" />
                            <h3 className="text-xl font-bold text-white drop-shadow-lg">
                                Confirming {stablePrediction.className}...
                            </h3>
                        </div>
                    );
                }
                return <p className="text-lg text-white/90 shadow-md">Analyzing...</p>;
            case "MULTIPLE_OBJECTS":
            case "AMBIGUOUS":
                return (
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-yellow-400" />
                        <h3 className="text-xl font-bold text-yellow-400 drop-shadow-lg">
                            {detectionState === 'AMBIGUOUS' ? 'Ambiguous Detection' : 'Multiple Objects'}
                        </h3>
                    </div>
                );
            case "NO_DETECTION":
            default:
                if (appStatus === 'CONFIDENCE_TOO_LOW') {
                    return (
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-6 w-6 text-yellow-400" />
                            <h3 className="text-xl font-bold text-yellow-400 drop-shadow-lg">
                                Confidence Too Low
                            </h3>
                        </div>
                    );
                }

                return <p className="text-lg text-white/90 shadow-md">Analyzing...</p>;
        }
    };

    return (
        <div className={cn("absolute inset-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex flex-col items-center", isCollectingImages || countdown > 0 || appStatus === 'CAMERA_WARMING_UP' ? "justify-center" : "justify-start")}>
            {renderContent()}
        </div>
    );
}
