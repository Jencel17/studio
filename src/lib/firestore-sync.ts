import {
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    Unsubscribe,
    serverTimestamp,
    collection,
    query,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";

// ===================== SETTINGS SYNC =====================

export interface SyncedSettings {
    confidenceThreshold: number;
    autoSortEnabled: boolean;
    autoFlashEnabled: boolean;
    autoCaptureEnabled: boolean;
    wakeLockEnabled: boolean;
    isTestMode: boolean;
}

const SETTINGS_DOC = doc(db, "app", "settings");

export const syncSettingsToFirestore = async (
    settings: Partial<SyncedSettings>
): Promise<void> => {
    try {
        await setDoc(
            SETTINGS_DOC,
            { ...settings, updatedAt: serverTimestamp() },
            { merge: true }
        );
    } catch (error) {
        console.error("Error syncing settings to Firestore:", error);
    }
};

export const subscribeToSettings = (
    callback: (settings: Partial<SyncedSettings>) => void
): Unsubscribe => {
    return onSnapshot(SETTINGS_DOC, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const { updatedAt, ...settings } = data;
            callback(settings as Partial<SyncedSettings>);
        }
    });
};

// ===================== STATS SYNC =====================

export interface SyncedCategoryStats {
    [category: string]: {
        count: number;
        correctCount: number;
        incorrectCount: number;
        lastUpdated: string;
    };
}

export interface SyncedDailyStats {
    [date: string]: {
        totalSorted: number;
        correctCount: number;
        incorrectCount: number;
    };
}

const STATS_DOC = doc(db, "app", "stats");

export const syncCategoryStatsToFirestore = async (
    categoryStats: SyncedCategoryStats
): Promise<void> => {
    try {
        await setDoc(
            STATS_DOC,
            { categoryStats, updatedAt: serverTimestamp() },
            { merge: true }
        );
    } catch (error) {
        console.error("Error syncing category stats:", error);
    }
};

export const syncDailyStatsToFirestore = async (
    dailyStats: SyncedDailyStats
): Promise<void> => {
    try {
        await setDoc(
            STATS_DOC,
            { dailyStats, updatedAt: serverTimestamp() },
            { merge: true }
        );
    } catch (error) {
        console.error("Error syncing daily stats:", error);
    }
};

export const subscribeToStats = (
    callback: (data: { categoryStats?: SyncedCategoryStats; dailyStats?: SyncedDailyStats }) => void
): Unsubscribe => {
    return onSnapshot(STATS_DOC, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            callback({
                categoryStats: data.categoryStats,
                dailyStats: data.dailyStats,
            });
        }
    });
};

// ===================== LIVE DETECTION SYNC =====================

export interface LiveDetectionState {
    currentPrediction: string | null;
    confidence: number;
    appStatus: string;
    timestamp: number;
    deviceId: string;
    recentSorts?: string[];
}

const LIVE_DETECTION_DOC = doc(db, "app", "liveDetection");

export const updateLiveDetection = async (
    state: LiveDetectionState
): Promise<void> => {
    try {
        await setDoc(LIVE_DETECTION_DOC, {
            ...state,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error updating live detection:", error);
    }
};

export const subscribeToLiveDetection = (
    callback: (state: LiveDetectionState | null) => void
): Unsubscribe => {
    return onSnapshot(LIVE_DETECTION_DOC, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.data() as LiveDetectionState);
        } else {
            callback(null);
        }
    });
};

// ===================== MODEL SYNC =====================

export interface CloudModel {
    name: string;
    createdAt: any;
    modelUrl: string;
    metadataUrl: string;
    weightsUrl: string;
    fileName: string;
}

const MODELS_COLLECTION = collection(db, "models");

export const uploadModelToCloud = async (
    name: string,
    model: File,
    metadata: File,
    weights: File
): Promise<void> => {
    try {
        const timestamp = Date.now();
        const baseDir = `models/${name}_${timestamp}`;

        const modelRef = ref(storage, `${baseDir}/model.json`);
        const metadataRef = ref(storage, `${baseDir}/metadata.json`);
        const weightsRef = ref(storage, `${baseDir}/weights.bin`);

        console.log(`[uploadModelToCloud] Starting upload for model: ${name}`);
        console.log(`[uploadModelToCloud] Model file size: ${model.size} bytes, Metadata size: ${metadata.size} bytes, Weights size: ${weights.size} bytes`);

        // Upload files in parallel
        const [modelSnap, metadataSnap, weightsSnap] = await Promise.all([
            uploadBytes(modelRef, model),
            uploadBytes(metadataRef, metadata),
            uploadBytes(weightsRef, weights)
        ]);

        console.log(`[uploadModelToCloud] Files uploaded successfully to Storage`);

        // Get download URLs
        const [modelUrl, metadataUrl, weightsUrl] = await Promise.all([
            getDownloadURL(modelSnap.ref),
            getDownloadURL(metadataSnap.ref),
            getDownloadURL(weightsSnap.ref)
        ]);

        console.log(`[uploadModelToCloud] Download URLs obtained, saving metadata to Firestore`);

        // Save metadata to Firestore
        await setDoc(doc(MODELS_COLLECTION, name), {
            name,
            modelUrl,
            metadataUrl,
            weightsUrl,
            fileName: name,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        console.log(`[uploadModelToCloud] Model "${name}" successfully uploaded to cloud`);

    } catch (error) {
        console.error("Error uploading model to cloud:", error);
        if (error instanceof Error) {
            console.error("Error details:", {
                message: error.message,
                code: (error as any).code,
                name: error.name
            });
        }
        throw error;
    }
};

export const subscribeToCloudModels = (
    callback: (models: CloudModel[]) => void
): Unsubscribe => {
    return onSnapshot(
        query(MODELS_COLLECTION),
        (snapshot) => {
            const models = snapshot.docs
                .map(doc => doc.data() as CloudModel & { deleted?: boolean })
                .filter(m => !m.deleted);
            callback(models);
        },
        (error) => {
            console.error("Error subscribing to cloud models:", error);
            // Return empty array on error so UI doesn't stay in loading state
            callback([]);
        }
    );
};

export const deleteModelFromCloud = async (name: string): Promise<void> => {
    try {
        await deleteDoc(doc(MODELS_COLLECTION, name));
    } catch (error) {
        console.error("Error deleting model from cloud:", error);
    }
};

// ===================== MANUAL SORT COMMAND =====================

export interface ManualSortCommand {
    command: string;
    timestamp: number;
    status: "pending" | "acknowledged";
}

const MANUAL_SORT_DOC = doc(db, "app", "manualSortCommand");

export const sendManualSortCommand = async (
    command: string
): Promise<void> => {
    try {
        await setDoc(MANUAL_SORT_DOC, {
            command: command.toUpperCase(),
            timestamp: Date.now(),
            status: "pending",
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error sending manual sort command:", error);
        throw error;
    }
};

export const subscribeToManualSortCommand = (
    callback: (cmd: ManualSortCommand | null) => void
): Unsubscribe => {
    return onSnapshot(MANUAL_SORT_DOC, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.data() as ManualSortCommand);
        } else {
            callback(null);
        }
    });
};

export const ackManualSortCommand = async (): Promise<void> => {
    try {
        await setDoc(
            MANUAL_SORT_DOC,
            { status: "acknowledged", updatedAt: serverTimestamp() },
            { merge: true }
        );
    } catch (error) {
        console.error("Error acknowledging manual sort command:", error);
    }
};
