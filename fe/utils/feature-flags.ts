import React from 'react';

export type FeatureFlagKey = 'syncStatusIndicator' | 'syncAttentionIndicator';

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  title: string;
  description: string;
  defaultEnabled: boolean;
  requires?: FeatureFlagKey;
}

export type FeatureFlagState = Record<FeatureFlagKey, boolean>;

export const FEATURE_FLAGS_STORAGE_KEY = 'comrev:feature-flags:v1';

export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'syncStatusIndicator',
    title: 'Sync status indicator',
    description: 'Show the top-right sync status pill across the app.',
    defaultEnabled: false,
  },
  {
    key: 'syncAttentionIndicator',
    title: 'Sync attention indicator',
    description: 'Show alert-style sync errors and the pending-item drawer.',
    defaultEnabled: false,
    requires: 'syncStatusIndicator',
  },
];

const DEFAULT_FLAGS = createDefaultFlags();
const FEATURE_FLAG_BY_KEY = new Map<FeatureFlagKey, FeatureFlagDefinition>(
  FEATURE_FLAGS.map((flag) => [flag.key, flag]),
);

const listeners = new Set<() => void>();
let flagsLoaded = false;
let currentFlags = DEFAULT_FLAGS;

function createDefaultFlags(): FeatureFlagState {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag.key, flag.defaultEnabled]),
  ) as FeatureFlagState;
}

export function getFeatureFlagDefinition(
  key: FeatureFlagKey,
): FeatureFlagDefinition {
  const definition = FEATURE_FLAG_BY_KEY.get(key);
  if (!definition) {
    throw new Error(`Unknown feature flag: ${key}`);
  }
  return definition;
}

export function getFeatureFlagDisabledReason(
  key: FeatureFlagKey,
  flags: FeatureFlagState = getFeatureFlagsSnapshot(),
): string | null {
  const definition = getFeatureFlagDefinition(key);
  if (!definition.requires || flags[definition.requires]) return null;
  const requirement = getFeatureFlagDefinition(definition.requires);
  return `Requires ${requirement.title}.`;
}

function normalizeFlagDependencies(flags: FeatureFlagState): FeatureFlagState {
  const normalized = { ...flags };
  let changed = true;

  while (changed) {
    changed = false;
    for (const flag of FEATURE_FLAGS) {
      if (flag.requires && normalized[flag.key] && !normalized[flag.requires]) {
        normalized[flag.key] = false;
        changed = true;
      }
    }
  }

  return normalized;
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
    const raw = storage.getItem(FEATURE_FLAGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const next = { ...defaults };
    for (const flag of FEATURE_FLAGS) {
      const storedValue = parsed[flag.key];
      if (typeof storedValue === 'boolean') {
        next[flag.key] = storedValue;
      }
    }
    return normalizeFlagDependencies(next);
  } catch (error) {
    console.warn('Unable to load feature flags:', error);
    return defaults;
  }
}

function persistFlags(flags: FeatureFlagState): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(flags));
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

export function getFeatureFlagsSnapshot(): FeatureFlagState {
  ensureFlagsLoaded();
  return currentFlags;
}

export function isFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  ensureFlagsLoaded();
  getFeatureFlagDefinition(key);
  return currentFlags[key];
}

export function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): void {
  ensureFlagsLoaded();
  getFeatureFlagDefinition(key);
  if (enabled && getFeatureFlagDisabledReason(key, currentFlags)) {
    return;
  }

  const nextFlags = { ...currentFlags, [key]: enabled };
  if (!enabled) {
    for (const flag of FEATURE_FLAGS) {
      if (flag.requires === key) {
        nextFlags[flag.key] = false;
      }
    }
  }

  const normalizedFlags = normalizeFlagDependencies(nextFlags);
  if (
    FEATURE_FLAGS.every(
      (flag) => currentFlags[flag.key] === normalizedFlags[flag.key],
    )
  ) {
    return;
  }

  currentFlags = normalizedFlags;
  persistFlags(normalizedFlags);
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
    if (event.key !== FEATURE_FLAGS_STORAGE_KEY) return;
    flagsLoaded = false;
    currentFlags = readStoredFlags();
    flagsLoaded = true;
    emitFeatureFlagsChanged();
  });
}
