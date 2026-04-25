"use client";

const DB_NAME = "ph-audio-pending";
const DB_VERSION = 1;
const STORE = "audios";

export interface StoredAudio {
  id: string;
  agentId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("agentId", "agentId", { unique: false });
      }
    };
  });
  return dbPromise;
}

export async function saveAudio(agentId: string, file: File): Promise<string> {
  const db = await openDb();
  const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: StoredAudio = {
    id,
    agentId,
    fileName: file.name,
    mimeType: file.type,
    blob: file,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingAudios(agentId: string): Promise<StoredAudio[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("agentId");
    const req = idx.getAll(agentId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
