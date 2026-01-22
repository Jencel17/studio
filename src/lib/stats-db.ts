
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'SortVisionDB';
const DB_VERSION = 2;
const STATS_STORE = 'categoryStats';
const TRAINING_STORE = 'trainingImages';

export interface CategoryStats {
    category: string;
    count: number;
    correctCount: number;
    incorrectCount: number;
    lastUpdated: Date;
}

export interface TrainingImage {
    id?: number;
    detectedAs: string;
    correctedTo: string;
    imageData: string; // base64
    timestamp: Date;
}

export interface DailyStats {
    date: string; // YYYY-MM-DD
    totalSorted: number;
    correctCount: number;
    incorrectCount: number;
}

// Use the same DB initialization as model-db.ts
const getDB = async (): Promise<IDBPDatabase> => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // Models store
            if (!db.objectStoreNames.contains('models')) {
                db.createObjectStore('models', { keyPath: 'name' });
            }
            // Category stats store
            if (!db.objectStoreNames.contains(STATS_STORE)) {
                db.createObjectStore(STATS_STORE, { keyPath: 'category' });
            }
            // Training images store
            if (!db.objectStoreNames.contains(TRAINING_STORE)) {
                const store = db.createObjectStore(TRAINING_STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('correctedTo', 'correctedTo', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        },
    });
};

// ===================== CATEGORY STATS =====================

export const incrementCategoryCount = async (
    category: string,
    wasCorrect: boolean
): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(STATS_STORE, 'readwrite');

    const existing = await tx.store.get(category.toLowerCase());

    if (existing) {
        existing.count += 1;
        if (wasCorrect) {
            existing.correctCount += 1;
        } else {
            existing.incorrectCount += 1;
        }
        existing.lastUpdated = new Date();
        await tx.store.put(existing);
    } else {
        await tx.store.put({
            category: category.toLowerCase(),
            count: 1,
            correctCount: wasCorrect ? 1 : 0,
            incorrectCount: wasCorrect ? 0 : 1,
            lastUpdated: new Date(),
        });
    }

    await tx.done;
};

export const getAllCategoryStats = async (): Promise<CategoryStats[]> => {
    const db = await getDB();
    return db.getAll(STATS_STORE);
};

export const resetAllStats = async (): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(STATS_STORE, 'readwrite');
    await tx.store.clear();
    await tx.done;
};

// ===================== TRAINING IMAGES =====================

export const saveTrainingImage = async (
    detectedAs: string,
    correctedTo: string,
    imageData: string
): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(TRAINING_STORE, 'readwrite');
    await tx.store.add({
        detectedAs: detectedAs.toLowerCase(),
        correctedTo: correctedTo.toLowerCase(),
        imageData,
        timestamp: new Date(),
    });
    await tx.done;
};

export const saveMultipleTrainingImages = async (
    detectedAs: string,
    correctedTo: string,
    images: string[]
): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(TRAINING_STORE, 'readwrite');

    for (const imageData of images) {
        await tx.store.add({
            detectedAs: detectedAs.toLowerCase(),
            correctedTo: correctedTo.toLowerCase(),
            imageData,
            timestamp: new Date(),
        });
    }

    await tx.done;
};

export const getTrainingImagesByCategory = async (category: string): Promise<TrainingImage[]> => {
    const db = await getDB();
    const index = db.transaction(TRAINING_STORE, 'readonly').store.index('correctedTo');
    return index.getAll(category.toLowerCase());
};

export const getAllTrainingImages = async (): Promise<TrainingImage[]> => {
    const db = await getDB();
    return db.getAll(TRAINING_STORE);
};

export const getTrainingImageCount = async (): Promise<number> => {
    const db = await getDB();
    return db.count(TRAINING_STORE);
};

export const clearAllTrainingImages = async (): Promise<void> => {
    const db = await getDB();
    const tx = db.transaction(TRAINING_STORE, 'readwrite');
    await tx.store.clear();
    await tx.done;
};

// ===================== SUMMARY STATS =====================

export interface SummaryStats {
    totalSorted: number;
    totalCorrect: number;
    totalIncorrect: number;
    accuracyRate: number;
    categoryBreakdown: CategoryStats[];
    trainingImagesCount: number;
}

export const getSummaryStats = async (): Promise<SummaryStats> => {
    const categoryStats = await getAllCategoryStats();
    const trainingCount = await getTrainingImageCount();

    const totalSorted = categoryStats.reduce((sum, c) => sum + c.count, 0);
    const totalCorrect = categoryStats.reduce((sum, c) => sum + c.correctCount, 0);
    const totalIncorrect = categoryStats.reduce((sum, c) => sum + c.incorrectCount, 0);
    const accuracyRate = totalSorted > 0 ? (totalCorrect / totalSorted) * 100 : 0;

    return {
        totalSorted,
        totalCorrect,
        totalIncorrect,
        accuracyRate,
        categoryBreakdown: categoryStats.sort((a, b) => b.count - a.count),
        trainingImagesCount: trainingCount,
    };
};
