import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThreeDConfig } from '../config-store';

type ConfigStoreModule = typeof import('../config-store');

function makeConfig(id = 'config-1'): ThreeDConfig {
  return {
    effectInstances: [],
    id,
    name: 'Test config',
    savedAt: '2026-07-07T07:00:00.000Z',
    showAdvanced: false,
    updatedAt: '2026-07-07T07:00:00.000Z',
  };
}

function responseStub(
  body: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
  const status = options.status ?? 200;
  return {
    json: async () => body,
    ok: options.ok ?? status < 400,
    status,
    statusText: options.statusText ?? (status < 400 ? 'OK' : 'Error'),
    text: async () => JSON.stringify(body),
  } as Response;
}

function setOnline(onLine: boolean) {
  vi.stubGlobal('navigator', { onLine });
}

async function loadStore(): Promise<ConfigStoreModule> {
  vi.resetModules();
  return import('../config-store');
}

function openDbVersion(
  version: number,
): Promise<{ blocked: boolean; db: IDBDatabase }> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ComRevConfigDB', version);
    let blocked = false;
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out opening upgraded DB; blocked=${blocked}`));
    }, 1000);

    request.onblocked = () => {
      blocked = true;
    };
    request.onerror = () => {
      clearTimeout(timeout);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve({ blocked, db: request.result });
    };
  });
}

describe('config store offline-first sync', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves locally and queues pending sync while offline', async () => {
    setOnline(false);
    const store = await loadStore();

    const result = await store.saveConfigOfflineFirst(
      makeConfig(),
      'https://api.example.test',
    );

    expect(result.synced).toBe(false);
    expect(result.error).toContain('Offline');
    expect(await store.getPendingSyncCount()).toBe(1);
    expect(await store.getLatestConfig()).toMatchObject({
      id: 'config-1',
      syncError: expect.stringContaining('Offline'),
      synced: false,
    });
    expect(store.getConfigSyncStatusSnapshot()).toMatchObject({
      phase: 'offline',
      pendingCount: 1,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records backend errors without losing the local save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseStub(
          { message: 'temporary outage' },
          { ok: false, status: 503, statusText: 'Unavailable' },
        ),
      ),
    );
    const store = await loadStore();

    const result = await store.saveConfigOfflineFirst(
      makeConfig(),
      'https://api.example.test',
    );

    expect(result.synced).toBe(false);
    expect(result.error).toContain('503');
    expect(await store.getPendingSyncCount()).toBe(1);
    expect(await store.getLatestConfig()).toMatchObject({
      id: 'config-1',
      syncError: expect.stringContaining('503'),
      synced: false,
    });
    expect(store.getConfigSyncStatusSnapshot()).toMatchObject({
      phase: 'error',
      pendingCount: 1,
      lastError: expect.stringContaining('503'),
    });
  });

  it('retries pending configs and clears the queue after sync succeeds', async () => {
    setOnline(false);
    const store = await loadStore();
    await store.saveConfigOfflineFirst(
      makeConfig(),
      'https://api.example.test',
    );

    setOnline(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseStub({ id: 'backend-config-1' })),
    );

    const summary = await store.syncPendingConfigs('https://api.example.test');

    expect(summary).toEqual({ failed: 0, pendingCount: 0, synced: 1 });
    expect(await store.getPendingSyncCount()).toBe(0);
    expect(await store.getLatestConfig()).toMatchObject({
      backendId: 'backend-config-1',
      id: 'config-1',
      synced: true,
      syncError: null,
    });
    expect(store.getConfigSyncStatusSnapshot()).toMatchObject({
      phase: 'synced',
      pendingCount: 0,
      lastError: null,
    });
  });

  it('resumes pending configuration sync from the app-wide retry coordinator', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          responseStub(
            { message: 'temporary outage' },
            { ok: false, status: 503, statusText: 'Unavailable' },
          ),
        )
        .mockResolvedValueOnce(responseStub({ id: 'backend-config-1' })),
    );
    const store = await loadStore();
    await store.saveConfigOfflineFirst(makeConfig(), 'https://api.example.test');

    const stopRetrying = store.startConfigSyncRetryLoop(
      'https://api.example.test',
    );

    await vi.waitFor(async () => {
      expect(await store.getPendingSyncCount()).toBe(0);
    });
    stopRetrying();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.getConfigSyncStatusSnapshot()).toMatchObject({
      pendingCount: 0,
      phase: 'synced',
    });
  });

  it('hands off a selected pending config exactly once', async () => {
    const store = await loadStore();
    const config = makeConfig('pending-config-1');

    store.setPendingConfigToLoad(config);

    expect(store.consumePendingConfigToLoad()).toEqual(config);
    expect(store.consumePendingConfigToLoad()).toBeNull();
  });

  it('loads a locally saved config by id', async () => {
    const store = await loadStore();
    await store.saveConfigLocally(makeConfig('config-a'));
    await store.saveConfigLocally(makeConfig('config-b'));

    expect(await store.getConfigById('config-a')).toMatchObject({
      id: 'config-a',
    });
    expect(await store.getConfigById('missing-config')).toBeNull();
  });

  it('closes IndexedDB connections after store operations', async () => {
    const store = await loadStore();
    await store.saveConfigLocally(makeConfig('config-a'));
    await store.markConfigSynced('config-a', 'backend-config-a');

    const upgraded = await openDbVersion(7);

    expect(upgraded.blocked).toBe(false);
    upgraded.db.close();
  });
});
