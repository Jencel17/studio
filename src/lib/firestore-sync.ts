
import {
    doc,
    setDoc,
    onSnapshot,
    Unsubscribe,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

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
