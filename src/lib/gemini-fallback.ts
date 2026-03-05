/**
 * Gemini AI Fallback Module
 * Captures a frame from the video and asks Gemini Flash Lite to classify the waste.
 * Only called when TensorFlow's local model is ambiguous/uncertain.
 */

const VALID_CATEGORIES = ["BIODEGRADABLE", "NON-BIODEGRADABLE", "E-WASTE"] as const;
export type GeminiCategory = typeof VALID_CATEGORIES[number];

const GEMINI_COOLDOWN_MS = 8000; // Prevent spamming — at most once every 8s
let lastGeminiCallTime = 0;

/**
 * Returns true if the Gemini fallback can be triggered right now.
 * Checks: online status + cooldown timer.
 */
export function isGeminiFallbackAvailable(): boolean {
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    const now = Date.now();
    return now - lastGeminiCallTime > GEMINI_COOLDOWN_MS;
}

/**
 * Captures a JPEG frame from a video or canvas element and returns base64.
 */
function captureFrameAsBase64(
    source: HTMLVideoElement | HTMLCanvasElement,
    quality = 0.75
): string | null {
    try {
        const canvas = document.createElement("canvas");
        if (source instanceof HTMLVideoElement) {
            canvas.width = source.videoWidth || 640;
            canvas.height = source.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(source, 0, 0);
        } else {
            // Already a canvas
            canvas.width = source.width;
            canvas.height = source.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(source, 0, 0);
        }
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        // Strip the prefix: "data:image/jpeg;base64,"
        return dataUrl.split(",")[1] ?? null;
    } catch (e) {
        console.error("[GeminiFallback] Frame capture error:", e);
        return null;
    }
}

/**
 * Main entry point: classify an item via Gemini Flash Lite.
 * @param source - The video or canvas to capture the frame from.
 * @returns The classified category string, or null if failed/unavailable.
 */
export async function classifyWithGemini(
    source: HTMLVideoElement | HTMLCanvasElement
): Promise<GeminiCategory | null> {
    if (!isGeminiFallbackAvailable()) {
        console.log("[GeminiFallback] Skipped — cooldown active or offline.");
        return null;
    }

    const imageBase64 = captureFrameAsBase64(source);
    if (!imageBase64) {
        console.warn("[GeminiFallback] Failed to capture frame.");
        return null;
    }

    lastGeminiCallTime = Date.now();

    try {
        const response = await fetch("/api/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
            signal: AbortSignal.timeout(10000), // 10-second timeout
        });

        if (!response.ok) {
            console.error("[GeminiFallback] API error:", response.status);
            return null;
        }

        const data = await response.json();
        const category = data.category as string;

        if (VALID_CATEGORIES.includes(category as GeminiCategory)) {
            console.log(`[GeminiFallback] Result: ${category}`);
            return category as GeminiCategory;
        }

        console.warn(`[GeminiFallback] Invalid category returned: ${category}`);
        return null;
    } catch (err: any) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
            console.warn("[GeminiFallback] Request timed out.");
        } else {
            console.error("[GeminiFallback] Unexpected error:", err);
        }
        return null;
    }
}
