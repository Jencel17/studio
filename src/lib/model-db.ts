
import { getDB } from './db';

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


export const saveModelToDb = async (name: string, model: File, metadata: File, weights: File): Promise<void> => {
  const db = await getDB();
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
  const db = await getDB();
  const allModels = await db.getAll(STORE_NAME);
  // Return only metadata, not the large file blobs
  return allModels.map(({ name, createdAt, id }) => ({ name, createdAt, id })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const getModelFromDb = async (name: string): Promise<StoredModelFiles | undefined> => {
  const db = await getDB();
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
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.delete(name);
  await tx.done;
};
