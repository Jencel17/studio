/**
 * Local AI Fallback Module
 * Uses a pre-trained MobileNet model (loaded via TF.js) to classify waste items
 * entirely in the browser. No API calls, no rate limits, works offline after first load.
 *
 * Replaces the Gemini API fallback.
 */

const VALID_CATEGORIES = ["BIODEGRADABLE", "NON-BIODEGRADABLE", "E-WASTE"] as const;
export type LocalAICategory = typeof VALID_CATEGORIES[number];

export interface LocalAIResult {
    category: LocalAICategory | null;
    error?: "MODEL_LOAD_FAILED" | "CAPTURE_FAILED" | "UNKNOWN";
    message?: string;
    confidence?: number;
}

// ── ImageNet class → waste category mapping ──
// These are curated mappings from common ImageNet class names to waste categories.
// MobileNet returns ImageNet‐1000 class names; we map the most relevant ones.

const BIODEGRADABLE_KEYWORDS = [
    // Food items
    "banana", "orange", "lemon", "apple", "pineapple", "strawberry", "fig",
    "pomegranate", "mango", "coconut", "corn", "broccoli", "cauliflower",
    "mushroom", "cucumber", "zucchini", "artichoke", "bell pepper", "pepper",
    "pizza", "burrito", "meat loaf", "hotdog", "cheeseburger", "sandwich",
    "french loaf", "bagel", "pretzel", "dough", "ice cream", "chocolate",
    "custard", "trifle", "carbonara", "guacamole", "consomme",
    "head cabbage", "acorn squash", "butternut squash", "spaghetti squash",
    "eggplant", "granny smith", "pineapple", "jackfruit", "starfruit",
    "potpie", "grocery store", "bakery",
    // Paper / cardboard / wood
    "envelope", "paper towel", "toilet tissue", "comic book", "book jacket",
    "cardboard", "carton", "packet", "newspaper", "notebook",
    "wooden spoon", "clog", "matchstick",
    // Natural / organic
    "hay", "straw", "leaf", "flower", "daisy", "sunflower", "rose",
    "pot", "flowerpot", "clay", "bee", "ant",
];

const NON_BIODEGRADABLE_KEYWORDS = [
    // Plastic
    "plastic bag", "water bottle", "pop bottle", "soda bottle", "bottle",
    "bottlecap", "pill bottle", "water jug", "bucket", "pail",
    "diaper", "bib", "mask", "crate",
    "rubber eraser", "nipple", "sunglasses", "sunglass",
    // Glass
    "beer glass", "goblet", "wine bottle", "beer bottle",
    "pitcher", "mixing bowl", "vase", "beaker",
    // Metal / cans
    "can opener", "tin can", "pop can", "soda can", "coffee can",
    "frying pan", "wok", "spatula", "pot", "caldron", "ladle",
    "safety pin", "screw", "nail", "chain", "hook",
    // Styrofoam / wrappers / mixed
    "grocery bag", "trash can", "ashcan", "garbage", "bin",
    "bath towel", "dishrag", "sock", "mitten", "glove",
    "umbrella", "poncho", "cloak",
    // Fabric / textile (non-recyclable)
    "jersey", "jean", "sweatshirt", "swimming trunks",
    "bikini", "miniskirt", "kimono", "stole",
];

const E_WASTE_KEYWORDS = [
    // Electronics
    "laptop", "notebook", "desktop computer", "monitor", "screen",
    "mouse", "keyboard", "remote control", "joystick", "switch",
    "power drill", "hair dryer", "vacuum", "iron", "electric fan",
    "space heater", "toaster", "microwave", "refrigerator",
    "washing machine", "dishwasher",
    // Phones / cameras
    "cellular telephone", "cell phone", "cellphone", "smartphone", "phone",
    "iPod", "digital watch", "analog clock", "digital clock",
    "hand-held computer", "PDA", "tablet",
    "Polaroid camera", "reflex camera", "camera",
    // Cables / components
    "plug", "adapter", "power plug", "modem", "hard disc",
    "hard disk", "CD player", "cassette player", "tape player",
    "loudspeaker", "speaker", "headphone", "earphone",
    "radio", "television", "CRT screen", "projector",
    // Batteries / bulbs
    "battery", "torch", "flashlight",
    "lampshade", "table lamp", "desk lamp",
    // Circuit boards
    "printed circuit board", "PCB", "circuit",
    "solar dish", "solar panel",
    // Other electronics
    "printer", "scanner", "photocopier",
    "cash machine", "ATM", "slot machine",
    "typewriter", "calculator",
];

// ── Model loading ──

let mobilenetModel: any = null;
let isLoading = false;
let loadError: string | null = null;

const MOBILENET_MODEL_URL =
    "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json";

// ImageNet labels (loaded alongside the model)
let imagenetClasses: string[] = [];
const IMAGENET_CLASSES_URL =
    "https://storage.googleapis.com/download.tensorflow.org/data/imagenet_class_index.json";

async function loadImageNetClasses(): Promise<string[]> {
    if (imagenetClasses.length > 0) return imagenetClasses;
    try {
        const res = await fetch(IMAGENET_CLASSES_URL);
        const data: Record<string, [string, string]> = await res.json();
        // data is { "0": ["n01440764", "tench"], "1": [...], ... }
        const classes: string[] = new Array(1000);
        for (const key of Object.keys(data)) {
            classes[parseInt(key)] = data[key][1]; // human‐readable label
        }
        imagenetClasses = classes;
        return classes;
    } catch (e) {
        console.error("[LocalAI] Failed to load ImageNet classes:", e);
        return [];
    }
}

async function ensureModelLoaded(): Promise<boolean> {
    if (mobilenetModel) return true;
    if (isLoading) {
        // Wait for the in-progress load
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (!isLoading) {
                    clearInterval(check);
                    resolve(!!mobilenetModel);
                }
            }, 200);
        });
    }

    isLoading = true;
    loadError = null;
    try {
        // Dynamically import tf (already loaded by the app)
        const tf = await import("@tensorflow/tfjs");
        console.log("[LocalAI] Loading MobileNet model...");
        mobilenetModel = await tf.loadLayersModel(MOBILENET_MODEL_URL);
        console.log("[LocalAI] MobileNet model loaded successfully.");

        await loadImageNetClasses();
        isLoading = false;
        return true;
    } catch (e: any) {
        console.error("[LocalAI] Model load failed:", e);
        loadError = e.message;
        isLoading = false;
        return false;
    }
}

// ── Classification ──

function captureFrameAsCanvas(
    source: HTMLVideoElement | HTMLCanvasElement
): HTMLCanvasElement | null {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 224;
        canvas.height = 224;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        if (source instanceof HTMLVideoElement) {
            const vw = source.videoWidth || 224;
            const vh = source.videoHeight || 224;
            // Center-crop to square, then resize to 224×224
            const cropSize = Math.min(vw, vh);
            const sx = Math.round((vw - cropSize) / 2);
            const sy = Math.round((vh - cropSize) / 2);
            ctx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
        } else {
            ctx.drawImage(source, 0, 0, 224, 224);
        }
        return canvas;
    } catch (e) {
        console.error("[LocalAI] Frame capture error:", e);
        return null;
    }
}

function mapToWasteCategory(className: string): LocalAICategory | null {
    const lower = className.toLowerCase().replace(/_/g, " ");

    for (const keyword of E_WASTE_KEYWORDS) {
        if (lower.includes(keyword.toLowerCase())) return "E-WASTE";
    }
    for (const keyword of BIODEGRADABLE_KEYWORDS) {
        if (lower.includes(keyword.toLowerCase())) return "BIODEGRADABLE";
    }
    for (const keyword of NON_BIODEGRADABLE_KEYWORDS) {
        if (lower.includes(keyword.toLowerCase())) return "NON-BIODEGRADABLE";
    }

    return null;
}

/**
 * Returns true if the local AI model is loaded and ready.
 */
export function isLocalAIAvailable(): boolean {
    return !!mobilenetModel;
}

/**
 * Returns whether the model is currently loading.
 */
export function isLocalAILoading(): boolean {
    return isLoading;
}

/**
 * Main entry point: classify an item using the local MobileNet model.
 * @param source - The video or canvas element to classify from.
 * @returns A LocalAIResult with the classified category.
 */
export async function classifyWithLocalAI(
    source: HTMLVideoElement | HTMLCanvasElement
): Promise<LocalAIResult> {
    const modelReady = await ensureModelLoaded();
    if (!modelReady) {
        return {
            category: null,
            error: "MODEL_LOAD_FAILED",
            message: loadError || "Could not load the AI model.",
        };
    }

    const canvas = captureFrameAsCanvas(source);
    if (!canvas) {
        return { category: null, error: "CAPTURE_FAILED", message: "Failed to capture camera frame." };
    }

    try {
        const tf = await import("@tensorflow/tfjs");

        // Preprocess: convert to tensor, normalize to [-1, 1] (MobileNet v1 expects this)
        let tensor = tf.browser
            .fromPixels(canvas)
            .toFloat()
            .div(tf.scalar(127.5))
            .sub(tf.scalar(1.0))
            .expandDims(0); // [1, 224, 224, 3]

        const predictions = mobilenetModel.predict(tensor) as any;
        const probabilities = (await predictions.data()) as Float32Array;

        // Clean up tensors
        tensor.dispose();
        predictions.dispose();

        // Get top 5 predictions
        const indices = Array.from(probabilities)
            .map((p, i) => ({ probability: p, index: i }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5);

        // Try to map top predictions to waste categories
        for (const { probability, index } of indices) {
            if (probability < 0.05) break; // Skip very low confidence

            const className = imagenetClasses[index] || `class_${index}`;
            const category = mapToWasteCategory(className);

            if (category) {
                console.log(
                    `[LocalAI] Classified as ${category} (ImageNet: ${className}, confidence: ${(probability * 100).toFixed(1)}%)`
                );
                return { category, confidence: probability };
            }
        }

        // If no mapping found, log the top predictions for debugging
        const topLabels = indices
            .slice(0, 3)
            .map(({ probability, index }) => `${imagenetClasses[index] || index} (${(probability * 100).toFixed(1)}%)`)
            .join(", ");
        console.log(`[LocalAI] No waste category match. Top predictions: ${topLabels}`);

        return {
            category: null,
            error: "UNKNOWN",
            message: "Could not identify the item as a specific waste type.",
        };
    } catch (e: any) {
        console.error("[LocalAI] Classification error:", e);
        return { category: null, error: "UNKNOWN", message: e.message || "Classification failed." };
    }
}
