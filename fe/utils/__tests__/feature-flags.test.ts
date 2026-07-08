import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } as Storage;
}

async function loadFeatureFlags() {
  vi.resetModules();
  return await import('../feature-flags');
}

describe('feature flags', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the sync attention indicator disabled by default', async () => {
    const flags = await loadFeatureFlags();

    expect(flags.isFeatureFlagEnabled('syncAttentionIndicator')).toBe(false);
  });

  it('hides the sync status indicator by default', async () => {
    const flags = await loadFeatureFlags();

    expect(flags.isFeatureFlagEnabled('syncStatusIndicator')).toBe(false);
  });

  it('persists enabled flags locally', async () => {
    const flags = await loadFeatureFlags();

    flags.setFeatureFlag('syncAttentionIndicator', true);

    expect(flags.isFeatureFlagEnabled('syncAttentionIndicator')).toBe(true);
    const reloaded = await loadFeatureFlags();
    expect(reloaded.isFeatureFlagEnabled('syncAttentionIndicator')).toBe(true);
  });

  it('persists enabled default-off flags locally', async () => {
    const flags = await loadFeatureFlags();

    flags.setFeatureFlag('syncStatusIndicator', true);

    expect(flags.isFeatureFlagEnabled('syncStatusIndicator')).toBe(true);
    const reloaded = await loadFeatureFlags();
    expect(reloaded.isFeatureFlagEnabled('syncStatusIndicator')).toBe(true);
  });

  it('notifies subscribers when a flag changes', async () => {
    const flags = await loadFeatureFlags();
    const listener = vi.fn();

    const unsubscribe = flags.subscribeFeatureFlags(listener);
    flags.setFeatureFlag('syncAttentionIndicator', true);
    unsubscribe();
    flags.setFeatureFlag('syncAttentionIndicator', false);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
