import type {
  ApiComment, ApiCustomColumn, ApiFlag, ApiHiddenColumn,
  ApiHiddenRow, PagedResponse,
} from '../types/table';

// ── Constants ──────────────────────────────────────────────────────────────────

const DB_NAME = 'structable';
const DB_VERSION = 1;
const OPS_STORE = 'ops';
const LS_LEGACY_KEY = 'structable:offline-queue'; // kept only for one-time migration

// ── Types ──────────────────────────────────────────────────────────────────────

type QueuedOp = {
  id: string;       // dedup key; e.g. "flag:upsert:header:name"
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: unknown;
  retries: number;
  seq: number;      // monotonic insertion order — used to sort after IDB getAll
  onSuccess?: (data: unknown) => void; // in-memory only; stripped before IDB write
};

type TableApiOptions = {
  baseUrl: string;
  onError: (msg: string) => void;
  onQueueChange?: (count: number) => void;
};

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OPS_STORE))
        req.result.createObjectStore(OPS_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: QueuedOp): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { onSuccess, ...toStore } = record;
    const tx = db.transaction(OPS_STORE, 'readwrite');
    tx.objectStore(OPS_STORE).put(toStore);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, 'readwrite');
    tx.objectStore(OPS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<QueuedOp[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, 'readonly');
    const req = tx.objectStore(OPS_STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedOp[]);
    req.onerror   = () => reject(req.error);
  });
}

// ── TableApi ───────────────────────────────────────────────────────────────────

export class TableApi {
  private base: string;
  private onError: (msg: string) => void;
  private onQueueChange?: (count: number) => void;
  private queue: QueuedOp[] = [];
  private flushing = false;
  private db: IDBDatabase | null = null;
  private nextSeq = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly RETRY_MS = 1_000;

  constructor({ baseUrl, onError, onQueueChange }: TableApiOptions) {
    this.base = baseUrl;
    this.onError = onError;
    this.onQueueChange = onQueueChange;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.clearRetryTimer(); this.flush(); });
      window.addEventListener('beforeunload', (e) => {
        if (this.queue.length > 0) {
          e.preventDefault(); // triggers the browser's "Leave site?" dialog
        }
      });
      this.init();
    }
  }

  get queueLength(): number { return this.queue.length; }

  // ── Initialization ─────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    try {
      this.db = await idbOpen();
      await this.migrateFromLocalStorage();

      const stored = await idbGetAll(this.db);
      stored.sort((a, b) => a.seq - b.seq);

      // Ops enqueued before IDB loaded (rare race): merge after IDB ops
      const storedIds = new Set(stored.map((op) => op.id));
      const preInitOps = this.queue.filter((op) => !storedIds.has(op.id));

      this.queue = [...stored, ...preInitOps];
      this.nextSeq = this.queue.length > 0
        ? Math.max(...this.queue.map((op) => op.seq)) + 1
        : 0;

      // Assign correct seq to pre-init ops and persist them
      for (const op of preInitOps) {
        op.seq = this.nextSeq++;
        await idbPut(this.db, op);
      }

      this.onQueueChange?.(this.queue.length);
      if (this.queue.length > 0 && navigator.onLine) this.flush();
    } catch {
      // IDB unavailable (e.g. private browsing on some browsers): queue is in-memory only
    }
  }

  private async migrateFromLocalStorage(): Promise<void> {
    if (!this.db) return;
    try {
      const raw = localStorage.getItem(LS_LEGACY_KEY);
      if (!raw) return;
      const items = JSON.parse(raw) as Omit<QueuedOp, 'seq'>[];
      for (let i = 0; i < items.length; i++) {
        await idbPut(this.db, { ...items[i], seq: i });
      }
      localStorage.removeItem(LS_LEGACY_KEY);
    } catch { /* ignore migration errors */ }
  }

  // ── Read operations ────────────────────────────────────────────────────────

  async fetchRepos(params: URLSearchParams, signal?: AbortSignal): Promise<PagedResponse> {
    return this.get<PagedResponse>(`/repos?${params}`, signal);
  }

  async fetchCustomColumns(): Promise<ApiCustomColumn[]> {
    return this.get<ApiCustomColumn[]>('/custom-columns');
  }

  async fetchComments(): Promise<ApiComment[]> {
    return this.get<ApiComment[]>('/comments');
  }

  async fetchFlags(): Promise<ApiFlag[]> {
    return this.get<ApiFlag[]>('/flags');
  }

  async fetchHiddenRows(): Promise<ApiHiddenRow[]> {
    return this.get<ApiHiddenRow[]>('/hidden-rows');
  }

  async fetchHiddenColumns(): Promise<ApiHiddenColumn[]> {
    return this.get<ApiHiddenColumn[]>('/hidden-columns');
  }

  // ── Write operations that need a round-trip result ─────────────────────────

  async createCustomColumn(payload: Omit<ApiCustomColumn, 'id'>): Promise<ApiCustomColumn> {
    const res = await fetch(`${this.base}/custom-columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ApiCustomColumn>;
  }

  upsertComment(repoId: number, colId: string, body: string, onSuccess?: (saved: ApiComment) => void): void {
    this.enqueue({
      id: `comment:upsert:${repoId}:${colId}`,
      method: 'POST',
      path: '/comments',
      body: { repo_id: repoId, column_id: colId, body: body.trim() },
      retries: 0,
      onSuccess: onSuccess ? (data) => onSuccess(data as ApiComment) : undefined,
    });
  }

  // ── Queued write operations ────────────────────────────────────────────────

  upsertFlag(key: string, color: string): void {
    this.enqueue({ id: `flag:upsert:${key}`, method: 'PUT', path: '/flags', body: { key, color }, retries: 0 });
  }

  deleteFlag(key: string): void {
    this.cancelOp(`flag:upsert:${key}`);
    this.enqueue({ id: `flag:delete:${key}`, method: 'DELETE', path: `/flags/${encodeURIComponent(key)}`, retries: 0 });
  }

  deleteComment(id: number, repoId: number, colId: string): void {
    this.cancelOp(`comment:upsert:${repoId}:${colId}`);
    if (id > 0) {
      this.enqueue({ id: `comment:delete:${id}`, method: 'DELETE', path: `/comments/${id}`, retries: 0 });
    }
  }

  deleteCustomColumn(id: number): void {
    this.enqueue({ id: `custom-col:delete:${id}`, method: 'DELETE', path: `/custom-columns/${id}`, retries: 0 });
  }

  addHiddenRow(repoId: number): void {
    this.cancelOp(`hidden-row:remove:${repoId}`);
    this.enqueue({ id: `hidden-row:add:${repoId}`, method: 'POST', path: '/hidden-rows', body: { repo_id: repoId }, retries: 0 });
  }

  removeHiddenRow(repoId: number): void {
    this.cancelOp(`hidden-row:add:${repoId}`);
    this.enqueue({ id: `hidden-row:remove:${repoId}`, method: 'DELETE', path: `/hidden-rows/${repoId}`, retries: 0 });
  }

  addHiddenColumn(columnId: string): void {
    this.cancelOp(`hidden-col:remove:${columnId}`);
    this.enqueue({ id: `hidden-col:add:${columnId}`, method: 'POST', path: '/hidden-columns', body: { column_id: columnId }, retries: 0 });
  }

  removeHiddenColumn(columnId: string): void {
    this.cancelOp(`hidden-col:add:${columnId}`);
    this.enqueue({ id: `hidden-col:remove:${columnId}`, method: 'DELETE', path: `/hidden-columns/${encodeURIComponent(columnId)}`, retries: 0 });
  }

  // ── Retry timer ────────────────────────────────────────────────────────────

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.flush(); }, TableApi.RETRY_MS);
  }

  // ── Queue internals ────────────────────────────────────────────────────────

  private cancelOp(id: string): void {
    this.queue = this.queue.filter((q) => q.id !== id);
    if (this.db) idbDelete(this.db, id).catch(() => {});
    this.onQueueChange?.(this.queue.length);
  }

  private enqueue(op: Omit<QueuedOp, 'seq'>): void {
    // Replace any existing op with same id (re-enqueue with fresh seq)
    const existing = this.queue.find((q) => q.id === op.id);
    if (existing) {
      this.queue = this.queue.filter((q) => q.id !== op.id);
      if (this.db) idbDelete(this.db, op.id).catch(() => {});
    }
    const record: QueuedOp = { ...op, seq: this.nextSeq++ };
    this.queue.push(record);
    // Fire-and-forget: op is in-memory already; IDB write is crash insurance
    if (this.db) idbPut(this.db, record).catch(() => {});
    this.onQueueChange?.(this.queue.length);
    this.flush();
  }

  async flush(): Promise<void> {
    // If IDB isn't open yet, init() will call flush() once it's ready
    if (!this.db) return;
    if (this.flushing || this.queue.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    this.clearRetryTimer();
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0];
        try {
          const res = await fetch(`${this.base}${op.path}`, {
            method: op.method,
            headers: op.body ? { 'Content-Type': 'application/json' } : undefined,
            body: op.body ? JSON.stringify(op.body) : undefined,
          });
          if (res.status >= 400 && res.status < 500) {
            // Client error: unrecoverable — drop and report
            this.queue.shift();
            await idbDelete(this.db, op.id);
            this.onQueueChange?.(this.queue.length);
            this.onError(`Sync error ${res.status} for ${op.method} ${op.path}`);
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // Read body before mutating queue (in case json() throws)
          let responseData: unknown;
          if (op.onSuccess && res.status !== 204) {
            try { responseData = await res.json(); } catch { /* no body */ }
          }
          // Success: remove from in-memory first, then IDB
          // (at-least-once: if crash between the two, op is replayed — all ops are idempotent)
          this.queue.shift();
          await idbDelete(this.db, op.id);
          this.onQueueChange?.(this.queue.length);
          op.onSuccess?.(responseData);
        } catch {
          op.retries++;
          if (op.retries >= 5) {
            this.onError(`Giving up on ${op.method} ${op.path} after 5 retries`);
            this.queue.shift();
            await idbDelete(this.db, op.id);
            this.onQueueChange?.(this.queue.length);
          } else {
            // Persist incremented retry count so it survives a crash
            await idbPut(this.db, op);
            this.scheduleRetry();
            break;
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }
}
