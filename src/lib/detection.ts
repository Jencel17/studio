import { Prediction } from "@/lib/types";

export type DetectionState = "SINGLE_OBJECT" | "MULTIPLE_OBJECTS" | "NO_DETECTION" | "AMBIGUOUS";

export const interpretDetectionsLocal = (
    predictions: Prediction[],
    confidenceThreshold: number
): { detectionState: DetectionState, primaryObject?: string, detectedObjects?: string[], reason: string } => {
    // Sort by probability descending
    const sorted = [...predictions].sort((a, b) => b.probability - a.probability);

    // 1. Basic check: Anything even remotely detected?
    if (!sorted.length || sorted[0].probability < 0.2) {
        return {
            detectionState: 'NO_DETECTION',
            reason: 'No objects detected.',
        };
    }

    const top = sorted[0];
    const second = sorted.length > 1 ? sorted[1] : null;

    // 2. High confidence match
    // Check if the top one is above the user's threshold
    if (top.probability >= confidenceThreshold) {
        // Double check for "Multiple Objects" - only if second one is also very close to the top
        if (second && second.probability > 0.4 && (top.probability - second.probability < 0.2)) {
            return {
                detectionState: 'MULTIPLE_OBJECTS',
                detectedObjects: [top.className, second.className],
                reason: `Ambiguous: ${top.className} (${(top.probability * 100).toFixed(1)}%) nearly tied with ${second.className} (${(second.probability * 100).toFixed(1)}%)`,
            };
        }

        return {
            detectionState: 'SINGLE_OBJECT',
            primaryObject: top.className,
            reason: `${top.className} detected at ${(top.probability * 100).toFixed(1)}% (Threshold: ${confidenceThreshold * 100}%)`,
        };
    }

    // 3. Ambiguous (Detected but below threshold)
    if (top.probability >= 0.2) {
        return {
            detectionState: 'AMBIGUOUS',
            reason: `${top.className} found at ${(top.probability * 100).toFixed(1)}%, which is below your ${confidenceThreshold * 100}% threshold.`,
        };
    }

    return {
        detectionState: 'NO_DETECTION',
        reason: 'Internal classification reset.',
    };
};
