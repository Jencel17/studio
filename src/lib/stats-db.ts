
import { getDB } from './db';
import { syncCategoryStatsToFirestore, syncDailyStatsToFirestore } from './firestore-sync';

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

    // Sync to Firestore (fire-and-forget, local-first)
    syncCategoryStatsAfterUpdate().catch((err) => {
        console.warn('[SortVision] Firestore sync failed for category stats — data saved locally, will retry on next update:', err);
    });
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

    // Sync cleared stats to Firestore
    syncCategoryStatsToFirestore({}).catch(console.error);
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

// ===================== DAILY STATS =====================

const DAILY_STATS_STORE = 'dailyStats';

export const incrementDailyStat = async (isCorrect: boolean): Promise<void> => {
    const db = await getDB();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const tx = db.transaction(DAILY_STATS_STORE, 'readwrite');
    const existing = await tx.store.get(today);

    const stats: DailyStats = existing || {
        date: today,
        totalSorted: 0,
        correctCount: 0,
        incorrectCount: 0,
    };

    stats.totalSorted += 1;
    if (isCorrect) {
        stats.correctCount += 1;
    } else {
        stats.incorrectCount += 1;
    }

    await tx.store.put(stats);
    await tx.done;

    // Sync to Firestore (fire-and-forget, local-first)
    syncDailyStatsAfterUpdate().catch((err) => {
        console.warn('[SortVision] Firestore sync failed for daily stats — data saved locally, will retry on next update:', err);
    });
};

export const getDailyStats = async (days: number = 7): Promise<DailyStats[]> => {
    const db = await getDB();
    const allStats: DailyStats[] = await db.getAll(DAILY_STATS_STORE);

    // Sort by date descending and return last N days
    return allStats
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, days)
        .reverse(); // Return in chronological order
};

// ===================== FIRESTORE SYNC HELPERS =====================

const syncCategoryStatsAfterUpdate = async (): Promise<void> => {
    const allStats = await getAllCategoryStats();
    const statsMap: Record<string, { count: number; correctCount: number; incorrectCount: number; lastUpdated: string }> = {};
    for (const stat of allStats) {
        statsMap[stat.category] = {
            count: stat.count,
            correctCount: stat.correctCount,
            incorrectCount: stat.incorrectCount,
            lastUpdated: stat.lastUpdated instanceof Date ? stat.lastUpdated.toISOString() : String(stat.lastUpdated),
        };
    }
    await syncCategoryStatsToFirestore(statsMap);
};

const syncDailyStatsAfterUpdate = async (): Promise<void> => {
    const allDaily = await getDailyStats(30);
    const dailyMap: Record<string, { totalSorted: number; correctCount: number; incorrectCount: number }> = {};
    for (const day of allDaily) {
        dailyMap[day.date] = {
            totalSorted: day.totalSorted,
            correctCount: day.correctCount,
            incorrectCount: day.incorrectCount,
        };
    }
    await syncDailyStatsToFirestore(dailyMap);
};
