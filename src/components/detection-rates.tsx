
"use client";

import type * as tmImage from "@teachablemachine/image";
import { Progress } from "@/components/ui/progress";
import { Prediction } from "@/lib/types";

interface DetectionRatesProps {
    getModel: () => tmImage.CustomMobileNet | null;
    currentPredictions: Prediction[];
}

export default function DetectionRates({ getModel, currentPredictions }: DetectionRatesProps) {
    const getProbability = (label: string) => {
        const prediction = currentPredictions.find(p => p.className === label);
        return prediction ? prediction.probability : 0;
    };
    const modelLabels = getModel()?.getClassLabels() ?? [];

    return (
        <div className="flex flex-col justify-center h-full w-full p-4 space-y-3">
            {modelLabels.length > 0 ? (
                modelLabels.filter(l => l.toLowerCase() !== 'background').map(label => {
                    const probability = getProbability(label);
                    const percentage = probability * 100;
                    return (
                        <div key={label} className="w-full space-y-1">
                            <div className="flex justify-between items-center text-sm">
                                <span className="capitalize text-muted-foreground">{label}</span>
                                <span className="font-semibold">
                                    {percentage.toFixed(1)}%
                                </span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                        </div>
                    );
                })
            ) : (
                <p className="text-sm text-muted-foreground text-center">Load a model to see categories.</p>
            )}
        </div>
    );
}
