import {
    doc,
    setDoc,
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

        // Upload files in parallel
        const [modelSnap, metadataSnap, weightsSnap] = await Promise.all([
            uploadBytes(modelRef, model),
            uploadBytes(metadataRef, metadata),
            uploadBytes(weightsRef, weights)
        ]);

        // Get download URLs
        const [modelUrl, metadataUrl, weightsUrl] = await Promise.all([
            getDownloadURL(modelSnap.ref),
            getDownloadURL(metadataSnap.ref),
            getDownloadURL(weightsSnap.ref)
        ]);

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

    } catch (error) {
        console.error("Error uploading model to cloud:", error);
        throw error;
    }
};

export const subscribeToCloudModels = (
    callback: (models: CloudModel[]) => void
): Unsubscribe => {
    return onSnapshot(query(MODELS_COLLECTION), (snapshot) => {
        const models = snapshot.docs.map(doc => doc.data() as CloudModel);
        callback(models);
    });
};

export const deleteModelFromCloud = async (name: string): Promise<void> => {
    try {
        // Delete metadata from Firestore
        await setDoc(doc(MODELS_COLLECTION, name), { deleted: true }, { merge: true });
        // Normally we'd also delete from Storage, but for simplicity let's just mark as deleted in DB
        // or delete the doc entirely if we don't need history
        // await deleteDoc(doc(MODELS_COLLECTION, name));
    } catch (error) {
        console.error("Error deleting model from cloud:", error);
    }
};
