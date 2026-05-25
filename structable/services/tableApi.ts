import type {
  ApiComment, ApiCustomColumn, ApiFlag, ApiHiddenColumn,
  ApiHiddenRow, PagedResponse,
} from '../types/table';

const QUEUE_KEY = 'structable:offline-queue';

type QueuedOp = {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: unknown;
  retries: number;
};

type TableApiOptions = {
  baseUrl: string;
  onError: (msg: string) => void;
};

export class TableApi {
  private base: string;
  private onError: (msg: string) => void;
  private queue: QueuedOp[] = [];
  private flushing = false;

  constructor({ baseUrl, onError }: TableApiOptions) {
    this.base = baseUrl;
    this.onError = onError;
    this.loadQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flush());
      if (this.queue.length > 0 && navigator.onLine) this.flush();
    }
  }

  // ── Read operations ────────────────────────────────────────────────────────

  async fetchRepos(params: URLSearchParams): Promise<PagedResponse> {
    return this.get<PagedResponse>(`/repos?${params}`);
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

  async createCustomColumn(
    payload: Omit<ApiCustomColumn, 'id'>,
  ): Promise<ApiCustomColumn> {
    const res = await fetch(`${this.base}/custom-columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ApiCustomColumn>;
  }

  async upsertComment(repoId: number, colId: string, body: string): Promise<ApiComment> {
    const res = await fetch(`${this.base}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: repoId, column_id: colId, body: body.trim() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ApiComment>;
  }

  // ── Queued write operations ────────────────────────────────────────────────

  upsertFlag(key: string, color: string): void {
    this.enqueue({
      id: `flag:upsert:${key}`,
      method: 'PUT',
      path: '/flags',
      body: { key, color },
      retries: 0,
    });
  }

  deleteFlag(key: string): void {
    // Cancel any pending upsert for this key
    this.queue = this.queue.filter((q) => q.id !== `flag:upsert:${key}`);
    this.enqueue({
      id: `flag:delete:${key}`,
      method: 'DELETE',
      path: `/flags/${encodeURIComponent(key)}`,
      retries: 0,
    });
  }

  deleteComment(id: number): void {
    this.enqueue({
      id: `comment:delete:${id}`,
      method: 'DELETE',
      path: `/comments/${id}`,
      retries: 0,
    });
  }

  deleteCustomColumn(id: number): void {
    this.enqueue({
      id: `custom-col:delete:${id}`,
      method: 'DELETE',
      path: `/custom-columns/${id}`,
      retries: 0,
    });
  }

  addHiddenRow(repoId: number): void {
    // Cancel any pending unhide for this row
    this.queue = this.queue.filter((q) => q.id !== `hidden-row:remove:${repoId}`);
    this.enqueue({
      id: `hidden-row:add:${repoId}`,
      method: 'POST',
      path: '/hidden-rows',
      body: { repo_id: repoId },
      retries: 0,
    });
  }

  removeHiddenRow(repoId: number): void {
    // Cancel any pending hide for this row
    this.queue = this.queue.filter((q) => q.id !== `hidden-row:add:${repoId}`);
    this.enqueue({
      id: `hidden-row:remove:${repoId}`,
      method: 'DELETE',
      path: `/hidden-rows/${repoId}`,
      retries: 0,
    });
  }

  addHiddenColumn(columnId: string): void {
    this.queue = this.queue.filter((q) => q.id !== `hidden-col:remove:${columnId}`);
    this.enqueue({
      id: `hidden-col:add:${columnId}`,
      method: 'POST',
      path: '/hidden-columns',
      body: { column_id: columnId },
      retries: 0,
    });
  }

  removeHiddenColumn(columnId: string): void {
    this.queue = this.queue.filter((q) => q.id !== `hidden-col:add:${columnId}`);
    this.enqueue({
      id: `hidden-col:remove:${columnId}`,
      method: 'DELETE',
      path: `/hidden-columns/${encodeURIComponent(columnId)}`,
      retries: 0,
    });
  }

  // ── Queue internals ────────────────────────────────────────────────────────

  private enqueue(op: QueuedOp): void {
    this.queue = this.queue.filter((q) => q.id !== op.id);
    this.queue.push(op);
    this.saveQueue();
    this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
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
            // Client error: drop the op, it will never succeed
            this.queue.shift();
            this.saveQueue();
            this.onError(`Sync error ${res.status} for ${op.method} ${op.path}`);
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.queue.shift();
          this.saveQueue();
        } catch {
          op.retries++;
          if (op.retries >= 5) {
            this.onError(`Giving up on ${op.method} ${op.path} after 5 retries`);
            this.queue.shift();
            this.saveQueue();
          } else {
            this.saveQueue();
            // Stop; retry when online
            window.addEventListener('online', () => this.flush(), { once: true });
            break;
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  private saveQueue(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    }
  }

  private loadQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      this.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedOp[];
    } catch {
      this.queue = [];
    }
  }
}
