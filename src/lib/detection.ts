import { Prediction } from "@/lib/types";

export type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

export const interpretDetectionsLocal = (
    predictions: Prediction[],
    confidenceThreshold: number
): { detectionState: DetectionState, primaryObject?: string, detectedObjects?: string[], reason: string } => {
    const sortedPredictions = [...predictions].sort(
        (a, b) => b.probability - a.probability
    );

    if (!sortedPredictions.length || sortedPredictions[0].probability < 0.5) {
        return {
            detectionState: 'NO_DETECTION',
            reason: 'No object detected with sufficient confidence.',
        };
    }

    const topPrediction = sortedPredictions[0];
    const secondPrediction = sortedPredictions.length > 1 ? sortedPredictions[1] : null;

    const highConfidencePredictions = sortedPredictions.filter(
        (p) => p.probability >= confidenceThreshold
    );

    if (
        topPrediction.probability > 0.90 &&
        (!secondPrediction || topPrediction.probability > secondPrediction.probability * 2)
    ) {
        return {
            detectionState: 'SINGLE_OBJECT',
            primaryObject: topPrediction.className,
            reason: `Very high confidence for ${topPrediction.className}.`,
        };
    }

    // Split confidence check
    if (secondPrediction && (topPrediction.probability + secondPrediction.probability > 0.85) && secondPrediction.probability > 0.15) {
        return {
            detectionState: 'MULTIPLE_OBJECTS',
            detectedObjects: [topPrediction.className, secondPrediction.className],
            reason: 'Split confidence between two objects.',
        };
    }

    if (highConfidencePredictions.length > 1) {
        return {
            detectionState: 'MULTIPLE_OBJECTS',
            detectedObjects: highConfidencePredictions.map((p) => p.className),
            reason: 'Multiple objects detected above confidence threshold.',
        };
    }

    if (highConfidencePredictions.length === 1) {
        return {
            detectionState: 'SINGLE_OBJECT',
            primaryObject: highConfidencePredictions[0].className,
            reason: `One object found above threshold: ${highConfidencePredictions[0].className}.`,
        };
    }

    if (topPrediction.probability >= 0.5 && topPrediction.probability < confidenceThreshold) {
        return {
            detectionState: 'AMBIGUOUS',
            reason: `Highest confidence (${(topPrediction.probability * 100).toFixed(0)}%) is below the required ${confidenceThreshold * 100}% threshold.`,
        };
    }

    return {
        detectionState: 'NO_DETECTION',
        reason: 'Analysis complete, but no clear result based on rules.',
    };
};
