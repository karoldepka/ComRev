import { openDB, type IDBPDatabase } from 'idb';
import { nanoid } from 'nanoid';
import { REST_BASE } from './apiBase';
import logger from '../utils/logger';

/** What a file cell stores per file (the bytes live on the server under `id`). */
export type FileRef = { id: string; name: string; mime_type: string; size_bytes: number };

type PendingFile = { ref: FileRef; blob: Blob };

const DB_NAME = 'structable-files';
const STORE = 'pending';
const MAX_RETRY_MS = 30_000;

// Offline-first: a file is kept in IndexedDB until the server confirms it, and plays from there meanwhile.
const objectUrls = new Map<string, string>();
const uploading = new Set<string>();
const listeners = new Set<(pendingCount: number) => void>();
let dbPromise: Promise<IDBPDatabase> | null = null;

const db = () => (dbPromise ??= openDB(DB_NAME, 1, { upgrade: (d) => d.createObjectStore(STORE) }));
const notify = () => listeners.forEach((listener) => listener(uploading.size));

export const isFileRef = (value: unknown): value is FileRef =>
  !!value && typeof value === 'object' && typeof (value as FileRef).id === 'string' && typeof (value as FileRef).name === 'string';

/** File refs in a cell value (tolerates a single ref or junk). */
export function fileRefsOf(value: unknown): FileRef[] {
  if (Array.isArray(value)) return value.filter(isFileRef);
  return isFileRef(value) ? [value] : [];
}

/** URL to play/download a file: the local copy while its upload is pending, the server afterwards. */
export function fileUrl(ref: FileRef): string {
  return objectUrls.get(ref.id) ?? `${REST_BASE}/files/${encodeURIComponent(ref.id)}`;
}

/** Number of files still uploading; the sync indicator includes it. */
export function subscribePendingFiles(listener: (pendingCount: number) => void): () => void {
  listeners.add(listener);
  listener(uploading.size);
  return () => listeners.delete(listener);
}

async function upload(id: string): Promise<void> {
  if (uploading.has(id)) return;
  uploading.add(id);
  notify();
  let delay = 1000;
  try {
    for (;;) {
      const pending = (await (await db()).get(STORE, id)) as PendingFile | undefined;
      if (!pending) return;
      try {
        const res = await fetch(`${REST_BASE}/files/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': pending.ref.mime_type, 'X-File-Name': encodeURIComponent(pending.ref.name) },
          body: pending.blob,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        await (await db()).delete(STORE, id);
        return;
      } catch (err) {
        logger.warn({ err, fileId: id, retryInMs: delay }, 'file upload failed; retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, MAX_RETRY_MS);
      }
    }
  } finally {
    uploading.delete(id);
    notify();
  }
}

/** Keep a picked/dropped file locally and start uploading it; returns the ref to store in the cell. */
export async function addFile(file: File): Promise<FileRef> {
  const ref: FileRef = { id: nanoid(), name: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size };
  await (await db()).put(STORE, { ref, blob: file } satisfies PendingFile, ref.id);
  objectUrls.set(ref.id, URL.createObjectURL(file));
  void upload(ref.id);
  return ref;
}

/** Resume uploads left over from a previous session (crash, closed tab, offline). */
export async function resumePendingUploads(): Promise<void> {
  try {
    const store = (await db()).transaction(STORE).store;
    for (const id of (await store.getAllKeys()) as string[]) {
      const pending = (await (await db()).get(STORE, id)) as PendingFile | undefined;
      if (pending && !objectUrls.has(id)) objectUrls.set(id, URL.createObjectURL(pending.blob));
      void upload(id);
    }
  } catch (err) {
    logger.error({ err }, 'resume pending file uploads failed');
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
