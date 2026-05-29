'use client';
import { useEffect, useRef, useState } from 'react';

type PendingChange = { id: string; description: string; timestamp: number };

type Props = {
  pendingUploads: number;
  isDownloading: boolean;
  pendingChanges?: PendingChange[];
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

function formatAge(timestamp: number): string {
  const secs = Math.floor((Date.now() - timestamp) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

export default function SyncIndicator({ pendingUploads, isDownloading, pendingChanges = [] }: Props) {
  const [isOffline, setIsOffline] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [, forceRender] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // Refresh relative timestamps every 10s while panel is open
  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => forceRender((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  const state = deriveState(isOffline, pendingUploads > 0, isDownloading);
  const label = state === 'uploading'
    ? `${pendingUploads} change${pendingUploads !== 1 ? 's' : ''} pending`
    : LABELS[state];

  return (
    <div className="sync-indicator-wrapper" ref={wrapperRef}>
      <div
        className={`sync-indicator sync-indicator--${state}`}
        title={isOpen ? undefined : label}
        aria-label={label}
        aria-live="polite"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen((o) => !o); }}
      >
        <span className="sync-dot" />
        <span className="sync-label">{label}</span>
        {state === 'uploading' && (
          <span className="sync-count">{pendingUploads}</span>
        )}
      </div>

      {isOpen && (
        <div className="sync-panel" role="dialog" aria-label="Pending changes">
          <div className="sync-panel-header">
            <span>
              {pendingUploads === 0
                ? 'No pending changes'
                : `${pendingUploads} change${pendingUploads !== 1 ? 's' : ''} pending`}
            </span>
            <button
              type="button"
              className="sync-panel-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="sync-panel-list">
            {pendingChanges.length === 0 ? (
              <div className="sync-panel-empty">Nothing to show</div>
            ) : (
              pendingChanges.map((c) => (
                <div key={c.id} className="sync-panel-item">
                  <span className="sync-panel-dot" />
                  <span className="sync-panel-desc">{c.description}</span>
                  <span className="sync-panel-age">{formatAge(c.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
