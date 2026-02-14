
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'SortVisionDB';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

export const getDB = (): Promise<IDBPDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('models')) {
                db.createObjectStore('models', { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains('categoryStats')) {
                db.createObjectStore('categoryStats', { keyPath: 'category' });
            }
            if (!db.objectStoreNames.contains('trainingImages')) {
                const store = db.createObjectStore('trainingImages', { keyPath: 'id', autoIncrement: true });
                store.createIndex('correctedTo', 'correctedTo', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
            if (!db.objectStoreNames.contains('dailyStats')) {
                db.createObjectStore('dailyStats', { keyPath: 'date' });
            }
        },
    });
    return dbPromise;
};
