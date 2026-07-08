import React from 'react';

export type FeatureFlagKey = 'syncAttentionIndicator';

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  title: string;
  description: string;
  defaultEnabled: boolean;
}

export type FeatureFlagState = Record<FeatureFlagKey, boolean>;

const STORAGE_KEY = 'comrev:feature-flags:v1';

export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'syncAttentionIndicator',
    title: 'Sync attention indicator',
    description: 'Show alert-style sync errors and the pending-item drawer.',
    defaultEnabled: false,
  },
];

const FEATURE_FLAG_KEYS = new Set<FeatureFlagKey>(
  FEATURE_FLAGS.map((flag) => flag.key),
);
const DEFAULT_FLAGS = createDefaultFlags();

const listeners = new Set<() => void>();
let flagsLoaded = false;
let currentFlags = DEFAULT_FLAGS;

function createDefaultFlags(): FeatureFlagState {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag.key, flag.defaultEnabled]),
  ) as FeatureFlagState;
}

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  try {
    return globalThis.localStorage;
  } catch (error) {
    console.warn('Unable to access feature flag storage:', error);
    return null;
  }
}

function readStoredFlags(): FeatureFlagState {
  const defaults = { ...DEFAULT_FLAGS };
  const storage = getStorage();
  if (!storage) return defaults;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const next = { ...defaults };
    for (const flag of FEATURE_FLAGS) {
      const storedValue = parsed[flag.key];
      if (typeof storedValue === 'boolean') {
        next[flag.key] = storedValue;
      }
    }
    return next;
  } catch (error) {
    console.warn('Unable to load feature flags:', error);
    return defaults;
  }
}

function persistFlags(flags: FeatureFlagState): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (error) {
    console.warn('Unable to persist feature flags:', error);
  }
}

function ensureFlagsLoaded(): void {
  if (flagsLoaded) return;
  currentFlags = readStoredFlags();
  flagsLoaded = true;
}

function emitFeatureFlagsChanged(): void {
  listeners.forEach((listener) => listener());
}

function assertFeatureFlagKey(key: FeatureFlagKey): void {
  if (!FEATURE_FLAG_KEYS.has(key)) {
    throw new Error(`Unknown feature flag: ${key}`);
  }
}

export function getFeatureFlagsSnapshot(): FeatureFlagState {
  ensureFlagsLoaded();
  return currentFlags;
}

export function isFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  ensureFlagsLoaded();
  assertFeatureFlagKey(key);
  return currentFlags[key];
}

export function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): void {
  ensureFlagsLoaded();
  assertFeatureFlagKey(key);
  if (currentFlags[key] === enabled) return;
  currentFlags = { ...currentFlags, [key]: enabled };
  persistFlags(currentFlags);
  emitFeatureFlagsChanged();
}

export function resetFeatureFlags(): void {
  ensureFlagsLoaded();
  currentFlags = { ...DEFAULT_FLAGS };
  persistFlags(currentFlags);
  emitFeatureFlagsChanged();
}

export function subscribeFeatureFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFeatureFlags(): FeatureFlagState {
  return React.useSyncExternalStore(
    subscribeFeatureFlags,
    getFeatureFlagsSnapshot,
    () => DEFAULT_FLAGS,
  );
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return React.useSyncExternalStore(
    subscribeFeatureFlags,
    () => isFeatureFlagEnabled(key),
    () =>
      FEATURE_FLAGS.find((flag) => flag.key === key)?.defaultEnabled ?? false,
  );
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    flagsLoaded = false;
    currentFlags = readStoredFlags();
    flagsLoaded = true;
    emitFeatureFlagsChanged();
  });
}
