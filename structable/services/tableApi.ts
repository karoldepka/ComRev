import { openDB, type IDBPDatabase } from 'idb';
import { nanoid } from 'nanoid';
import type {
  ApiCustomColumn, ApiFlag, ApiHiddenColumn,
  ApiHiddenRow, ApiRemark, ApiTable, PagedResponse, RemarkTarget,
} from '../types/table';
import logger from '../utils/logger';

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
  enqueuedAt?: number; // optional: absent in ops persisted by older code
  /** Set on 4xx response: kept in IDB for reference but never retried. */
  failedAt?: number;
  onSuccess?: (data: unknown) => void; // in-memory only; stripped before IDB write
};

type StoredOp = Omit<QueuedOp, 'onSuccess'>;

function describeOp(op: StoredOp): string {
  const parts = op.id.split(':');
  const type = parts[0];
  const action = parts[1];
  if (type === 'cell' && action === 'upsert') {
    const col = parts[3] ?? '';
    const raw = (op.body as { value?: unknown } | undefined)?.value;
    const str = raw != null ? String(raw) : '';
    const preview = str.length > 0 ? `: "${str.slice(0, 40)}${str.length > 40 ? '…' : ''}"` : '';
    return col ? `Edit cell [${col}]${preview}` : `Edit cell${preview}`;
  }
  if (type === 'flag')       return action === 'upsert' ? 'Update flag'    : 'Remove flag';
  if (type === 'remark')     return action === 'upsert' ? 'Save remark'    : 'Delete remark';
  if (type === 'custom-col') return action === 'create' ? 'Create column'  : 'Delete column';
  if (type === 'hidden-row') return action === 'add'    ? 'Hide row'       : 'Unhide row';
  if (type === 'hidden-col') return action === 'add'    ? 'Hide column'    : 'Unhide column';
  if (type === 'table') {
    const title = (op.body as { title?: string } | undefined)?.title;
    if (action === 'create') return title ? `Create table "${title}"` : 'Create table';
    return title ? `Update table "${title}"` : 'Update table';
  }
  return `${op.method} ${op.path}`;
}

interface StructableDB {
  [OPS_STORE]: { key: string; value: StoredOp };
}

type TableApiOptions = {
  baseUrl: string;
  tableId: string;
  onError: (msg: string) => void;
  onQueueChange?: (count: number) => void;
};

// ── TableApi ───────────────────────────────────────────────────────────────────

export class TableApi {
  private base: string;
  private tableId: string;
  private onError: (msg: string) => void;
  private onQueueChange?: (count: number) => void;
  private queue: QueuedOp[] = [];
  private flushing = false;
  private db: IDBPDatabase<StructableDB> | null = null;
  private nextSeq = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly RETRY_MS = 1_000;

  constructor({ baseUrl, tableId, onError, onQueueChange }: TableApiOptions) {
    this.base = baseUrl;
    this.tableId = tableId;
    this.onError = onError;
    this.onQueueChange = onQueueChange;
    if (typeof window !== 'undefined') {
      logger.info({ baseUrl: this.base, tableId: this.tableId }, 'table api initialized');
      window.addEventListener('online', () => {
        logger.info({ queueLength: this.queue.length }, 'browser online; flushing table api queue');
        this.clearRetryTimer();
        this.flush();
      });
      window.addEventListener('beforeunload', (e) => {
        if (this.queue.length > 0) {
          logger.info({ queueLength: this.queue.length }, 'blocking unload with pending table api queue');
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
      this.db = await openDB<StructableDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(OPS_STORE))
            db.createObjectStore(OPS_STORE, { keyPath: 'id' });
        },
      });
      await this.migrateFromLocalStorage();

      const stored = await this.db.getAll(OPS_STORE);
      stored.sort((a, b) => a.seq - b.seq);

      const pending = stored.filter((op) => !op.failedAt);
      const failed  = stored.filter((op) =>  op.failedAt);
      if (failed.length > 0)
        logger.info({ count: failed.length }, 'skipping previously-failed (4xx) ops on startup');

      // Ops enqueued before IDB loaded (rare race): merge after IDB ops
      const storedIds = new Set(stored.map((op) => op.id));
      const preInitOps = this.queue.filter((op) => !storedIds.has(op.id));

      this.queue = [...pending, ...preInitOps];
      this.nextSeq = stored.length > 0
        ? Math.max(...stored.map((op) => op.seq)) + 1
        : 0;

      // Assign correct seq to pre-init ops and persist them
      for (const op of preInitOps) {
        op.seq = this.nextSeq++;
        await this.idbPut(op);
      }

      this.onQueueChange?.(this.queue.length);
      logger.info({ queueLength: this.queue.length }, 'table api queue restored from indexeddb');
      if (this.queue.length > 0 && navigator.onLine) this.flush();
    } catch (cause) {
      // IDB unavailable (e.g. private browsing on some browsers): queue is in-memory only
      logger.error({ cause }, 'table api indexeddb init failed; queue is memory-only');
    }
  }

  private async migrateFromLocalStorage(): Promise<void> {
    if (!this.db) return;
    try {
      const raw = localStorage.getItem(LS_LEGACY_KEY);
      if (!raw) return;
      const items = JSON.parse(raw) as StoredOp[];
      for (let i = 0; i < items.length; i++) {
        await this.db.put(OPS_STORE, { ...items[i], seq: i });
      }
      localStorage.removeItem(LS_LEGACY_KEY);
      logger.info({ count: items.length }, 'migrated legacy offline queue to indexeddb');
    } catch (cause) {
      logger.error({ cause }, 'legacy offline queue migration failed');
    }
  }

  // ── IDB helpers (use idb library) ─────────────────────────────────────────

  private async idbPut(op: QueuedOp): Promise<void> {
    if (!this.db) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { onSuccess, ...toStore } = op;
    await this.db.put(OPS_STORE, toStore);
  }

  private idbDelete(id: string): void {
    this.db?.delete(OPS_STORE, id).catch(() => {});
  }

  // ── Read operations ────────────────────────────────────────────────────────

  setTableId(tableId: string): void {
    this.tableId = tableId;
  }

  async fetchDataRows(tableId: string, params: URLSearchParams, signal?: AbortSignal): Promise<PagedResponse> {
    return this.get<PagedResponse>(`/tables/${encodeURIComponent(tableId)}/data-rows?${params}`, signal);
  }

  async fetchCustomColumns(tableId: string): Promise<ApiCustomColumn[]> {
    return this.get<ApiCustomColumn[]>(`/tables/${encodeURIComponent(tableId)}/custom-columns`);
  }

  async setColumnFrozen(tableId: string, columnId: string, isFrozen: boolean): Promise<ApiCustomColumn> {
    return this.patch<ApiCustomColumn>(
      `/tables/${encodeURIComponent(tableId)}/custom-columns/${encodeURIComponent(columnId)}`,
      { is_frozen: isFrozen },
    );
  }

  async setColumnSourcePath(tableId: string, columnId: string, sourcePath: string[] | null): Promise<ApiCustomColumn> {
    return this.patch<ApiCustomColumn>(
      `/tables/${encodeURIComponent(tableId)}/custom-columns/${encodeURIComponent(columnId)}`,
      { source_path: sourcePath ?? [] },
    );
  }

  async nukeDb(): Promise<void> {
    const url = `${this.base}/NUKE__DB`;
    let res: Response;
    try {
      res = await fetch(url, { method: 'DELETE' });
    } catch (cause) {
      throw new Error(`NUKE__DB: cannot reach server (${cause instanceof Error ? cause.message : String(cause)})`);
    }
    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch { /* no body */ }
      throw new Error(`NUKE__DB failed — HTTP ${res.status}${text ? `: ${text}` : ''}`);
    }
  }

  async fetchRemarks(): Promise<ApiRemark[]> {
    return this.get<ApiRemark[]>('/remarks');
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

  // ── Write operations ───────────────────────────────────────────────────────

  async fetchTables(): Promise<ApiTable[]> {
    return this.get<ApiTable[]>('/tables');
  }

  createTable(payload: { id: string; title: string; description?: string | null }): void {
    this.enqueue({
      id: `table:create:${payload.id}`,
      method: 'POST',
      path: '/tables',
      body: payload,
      retries: 0,
    });
  }

  patchTable(id: string, updates: { title?: string; description?: string | null }): void {
    this.enqueue({
      id: `table:patch:${id}`,
      method: 'PATCH',
      path: `/tables/${encodeURIComponent(id)}`,
      body: updates,
      retries: 0,
    });
  }

  /** Client generates a nanoid so the column is usable immediately offline. */
  createCustomColumn(
    tableId: string,
    payload: Omit<ApiCustomColumn, 'id' | 'read_only' | 'readOnly' | 'is_editable' | 'types'>,
    id?: string,
    onConfirmed?: (confirmed: ApiCustomColumn) => void,
  ): ApiCustomColumn {
    const columnId = id ?? nanoid();
    const temp: ApiCustomColumn = { ...payload, id: columnId, read_only: false, readOnly: false, types: ['text'] };
    this.enqueue({
      id: `custom-col:create:${columnId}`,
      method: 'POST',
      path: `/tables/${encodeURIComponent(tableId)}/custom-columns`,
      body: { id: columnId, ...payload },
      retries: 0,
      onSuccess: onConfirmed ? (data) => onConfirmed(data as ApiCustomColumn) : undefined,
    });
    return temp;
  }

  /**
   * Upsert a remark (note or comment). Client generates the nanoid so the
   * remark is available offline before the server is reachable.
   * If `id` is omitted a new nanoid is generated and returned.
   */
  upsertRemark(
    id: string | null,
    kind: 'note' | 'comment',
    body: string,
    targets: RemarkTarget[],
    onSuccess?: (saved: ApiRemark) => void,
  ): string {
    const rid = id ?? nanoid();
    this.enqueue({
      id: `remark:upsert:${rid}`,
      method: 'PUT',
      path: `/remarks/${encodeURIComponent(rid)}`,
      body: { body: body.trim(), kind, targets },
      retries: 0,
      onSuccess: onSuccess ? (data) => onSuccess(data as ApiRemark) : undefined,
    });
    return rid;
  }

  // ── Queued write operations ────────────────────────────────────────────────

  upsertFlag(key: string, color: string): void {
    const id = nanoid();
    this.enqueue({ id: `flag:upsert:${key}`, method: 'PUT', path: '/flags', body: { id, key, color }, retries: 0 });
  }

  deleteFlag(key: string): void {
    this.cancelOp(`flag:upsert:${key}`);
    this.enqueue({ id: `flag:delete:${key}`, method: 'DELETE', path: `/flags/${encodeURIComponent(key)}`, retries: 0 });
  }

  deleteRemark(id: string): void {
    this.cancelOp(`remark:upsert:${id}`);
    this.enqueue({ id: `remark:delete:${id}`, method: 'DELETE', path: `/remarks/${encodeURIComponent(id)}`, retries: 0 });
  }

  deleteCustomColumn(id: string): void {
    // If the create is still queued (never reached the server), cancel it instead
    const createKey = `custom-col:create:${id}`;
    if (this.queue.some((q) => q.id === createKey)) {
      this.cancelOp(createKey);
      return;
    }
    this.enqueue({ id: `custom-col:delete:${id}`, method: 'DELETE', path: `/custom-columns/${encodeURIComponent(id)}`, retries: 0 });
  }

  addHiddenRow(rowId: string): void {
    const id = nanoid();
    this.cancelOp(`hidden-row:remove:${rowId}`);
    this.enqueue({ id: `hidden-row:add:${rowId}`, method: 'POST', path: '/hidden-rows', body: { id, row_id: rowId }, retries: 0 });
  }

  removeHiddenRow(rowId: string): void {
    this.cancelOp(`hidden-row:add:${rowId}`);
    this.enqueue({ id: `hidden-row:remove:${rowId}`, method: 'DELETE', path: `/hidden-rows/${encodeURIComponent(rowId)}`, retries: 0 });
  }

  addHiddenColumn(columnId: string): void {
    const id = nanoid();
    this.cancelOp(`hidden-col:remove:${columnId}`);
    this.enqueue({ id: `hidden-col:add:${columnId}`, method: 'POST', path: '/hidden-columns', body: { id, column_id: columnId }, retries: 0 });
  }

  /**
   * Persist a cell value edit. Coalesces rapid edits to the same cell.
   * colId may carry a 'custom:' prefix — stripped before sending to the API.
   */
  upsertCellValue(rowId: string, colId: string, value: unknown): void {
    const apiColId = colId.startsWith('custom:') ? colId.slice('custom:'.length) : colId;
    this.enqueue({
      id: `cell:upsert:${rowId}:${apiColId}`,
      method: 'PATCH',
      path: `/tables/${encodeURIComponent(this.tableId)}/rows/${encodeURIComponent(rowId)}/values`,
      body: { col_id: apiColId, value },
      retries: 0,
    });
  }

  removeHiddenColumn(columnId: string): void {
    this.cancelOp(`hidden-col:add:${columnId}`);
    this.enqueue({ id: `hidden-col:remove:${columnId}`, method: 'DELETE', path: `/hidden-columns/${encodeURIComponent(columnId)}`, retries: 0 });
  }

  createRow(tableId: string, rowId: string, values: Record<string, unknown>): void {
    this.enqueue({
      id: `row:create:${rowId}`,
      method: 'POST',
      path: `/tables/${encodeURIComponent(tableId)}/rows`,
      body: { id: rowId, ...values },
      retries: 0,
    });
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
    this.idbDelete(id);
    this.onQueueChange?.(this.queue.length);
  }

  getQueueSummary(): { id: string; description: string; timestamp: number }[] {
    return this.queue.map((op) => ({
      id: op.id,
      description: describeOp(op),
      timestamp: op.enqueuedAt ?? Date.now(),
    }));
  }

  private enqueue(op: Omit<QueuedOp, 'seq' | 'enqueuedAt'>): void {
    // Replace any existing op with same id (re-enqueue with fresh seq)
    if (this.queue.some((q) => q.id === op.id)) {
      this.queue = this.queue.filter((q) => q.id !== op.id);
      this.idbDelete(op.id);
    }
    const record: QueuedOp = { ...op, seq: this.nextSeq++, enqueuedAt: Date.now() };
    this.queue.push(record);
    logger.info({ id: record.id, method: record.method, path: record.path, queueLength: this.queue.length }, 'queued table api operation');
    // Fire-and-forget: op is in-memory already; IDB write is crash insurance
    this.idbPut(record).catch((cause) => logger.error({ cause, id: record.id }, 'failed to persist queued table api operation'));
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
    logger.debug({ queueLength: this.queue.length }, 'starting table api flush');
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0];
        logger.debug({ id: op.id, method: op.method, path: op.path, retries: op.retries }, 'flushing table api operation');
        try {
          const res = await fetch(`${this.base}${op.path}`, {
            method: op.method,
            headers: op.body ? { 'Content-Type': 'application/json' } : undefined,
            body: op.body ? JSON.stringify(op.body) : undefined,
          });
          if (res.status >= 400 && res.status < 500) {
            // Client error: not retried — stamp failedAt in IDB for reference, drop from queue
            let errBody = '';
            try { errBody = await res.text(); } catch { /* no body */ }
            await this.idbPut({ ...op, failedAt: Date.now() });
            this.queue.shift();
            this.onQueueChange?.(this.queue.length);
            this.onError(`Sync error ${res.status} for ${op.method} ${this.base}${op.path}${errBody ? `: ${errBody.slice(0, 300)}` : ''}`);
            logger.warn({ id: op.id, status: res.status, queueLength: this.queue.length }, 'table api operation failed (4xx); kept in IDB, will not retry');
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${op.method} ${this.base}${op.path}`);
          // Read body before mutating queue (in case json() throws)
          let responseData: unknown;
          if (op.onSuccess && res.status !== 204) {
            try { responseData = await res.json(); } catch { /* no body */ }
          }
          // Success: remove from in-memory first, then IDB
          // (at-least-once: if crash between the two, op is replayed — all ops are idempotent)
          this.queue.shift();
          await this.db.delete(OPS_STORE, op.id);
          this.onQueueChange?.(this.queue.length);
          logger.info({ id: op.id, queueLength: this.queue.length }, 'flushed table api operation');
          op.onSuccess?.(responseData);
        } catch (cause) {
          op.retries++;
          const reason = cause instanceof Error ? cause.message : String(cause);
          logger.warn({ id: op.id, method: op.method, path: op.path, retries: op.retries, reason }, 'table api operation failed; retry scheduled');
          if (op.retries === 1 || op.retries % 10 === 0) {
            this.onError(`Syncing "${describeOp(op)}" failed (attempt ${op.retries}): ${reason}`);
          }
          // Persist incremented retry count so it survives a crash, then retry forever
          await this.idbPut(op);
          this.scheduleRetry();
          break;
        }
      }
    } finally {
      this.flushing = false;
      logger.debug({ queueLength: this.queue.length }, 'table api flush finished');
    }
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      logger.debug({ url }, 'table api get started');
      res = await fetch(url, { signal });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      logger.error({ url, reason }, 'table api get failed');
      throw new Error(`GET ${url} — ${reason}`);
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* no body */ }
      logger.error({ url, status: res.status, body: body.slice(0, 300) }, 'table api get returned error');
      throw new Error(`GET ${url} — HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    logger.debug({ url, status: res.status }, 'table api get finished');
    return res.json() as Promise<T>;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch { /* no body */ }
      throw new Error(`PATCH ${url} — HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
    return res.json() as Promise<T>;
  }
}
