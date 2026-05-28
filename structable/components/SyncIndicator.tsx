'use client';
import { useState, useEffect } from 'react';

type Props = {
  pendingUploads: number;
  isDownloading: boolean;
};

type SyncState = 'synced' | 'uploading' | 'downloading' | 'offline';

function deriveState(offline: boolean, uploads: boolean, downloading: boolean): SyncState {
  if (offline)     return 'offline';
  if (uploads)     return 'uploading';
  if (downloading) return 'downloading';
  return 'synced';
}

const LABELS: Record<SyncState, string> = {
  synced:      'All changes synced',
  uploading:   'Syncing…',
  downloading: 'Loading…',
  offline:     'Offline',
};

export default function SyncIndicator({ pendingUploads, isDownloading }: Props) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOnline  = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const state = deriveState(isOffline, pendingUploads > 0, isDownloading);
  const label = state === 'uploading'
    ? `${pendingUploads} change${pendingUploads !== 1 ? 's' : ''} pending`
    : LABELS[state];

  return (
    <div
      className={`sync-indicator sync-indicator--${state}`}
      title={label}
      aria-label={label}
      aria-live="polite"
    >
      <span className="sync-dot" />
      <span className="sync-label">{label}</span>
      {state === 'uploading' && (
        <span className="sync-count">{pendingUploads}</span>
      )}
    </div>
  );
}
