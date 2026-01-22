
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'SortVisionDB';
const DB_VERSION = 2; // Updated to include new stores
const STORE_NAME = 'models';

export interface StoredModel {
  id: number;
  name: string;
  createdAt: Date;
}

export interface StoredModelFiles {
  model: File;
  metadata: File;
  weights: File;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

const initDB = (): Promise<IDBPDatabase> => {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Models store (original, version 1)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
      // New stores added in version 2
      if (!db.objectStoreNames.contains('categoryStats')) {
        db.createObjectStore('categoryStats', { keyPath: 'category' });
      }
      if (!db.objectStoreNames.contains('trainingImages')) {
        const store = db.createObjectStore('trainingImages', { keyPath: 'id', autoIncrement: true });
        store.createIndex('correctedTo', 'correctedTo', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    },
  });
  return dbPromise;
};

export const saveModelToDb = async (name: string, model: File, metadata: File, weights: File): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.put({
    name,
    model,
    metadata,
    weights,
    createdAt: new Date(),
  });
  await tx.done;
};

export const getModelsFromDb = async (): Promise<StoredModel[]> => {
  const db = await initDB();
  const allModels = await db.getAll(STORE_NAME);
  // Return only metadata, not the large file blobs
  return allModels.map(({ name, createdAt, id }) => ({ name, createdAt, id })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const getModelFromDb = async (name: string): Promise<StoredModelFiles | undefined> => {
  const db = await initDB();
  const record = await db.get(STORE_NAME, name);
  if (record) {
    return {
      model: record.model,
      metadata: record.metadata,
      weights: record.weights,
    };
  }
  return undefined;
};

export const deleteModelFromDb = async (name: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.delete(name);
  await tx.done;
};
