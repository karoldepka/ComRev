'use client';
import { useState, useEffect } from 'react';

type Props = {
  pendingUploads: number;
  isDownloading: boolean;
};

export default function SyncIndicator({ pendingUploads, isDownloading }: Props) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const goOnline  = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const hasUploads = pendingUploads > 0;
  const title = isOffline
    ? hasUploads
      ? `Offline — ${pendingUploads} change${pendingUploads !== 1 ? 's' : ''} queued`
      : 'Offline'
    : hasUploads
    ? `${pendingUploads} change${pendingUploads !== 1 ? 's' : ''} pending upload`
    : isDownloading
    ? 'Loading data from server…'
    : 'All changes synced';

  return (
    <div className="sync-indicator" title={title} aria-label={title}>
      <span className={`sync-cloud${isOffline ? ' sync-cloud--offline' : ''}`}>☁</span>
      <span className="sync-badges">
        {hasUploads
          ? <span className="sync-badge sync-upload">{pendingUploads}↑</span>
          : <span className="sync-badge sync-synced">✓</span>
        }
        {isDownloading && <span className="sync-badge sync-download">↓</span>}
      </span>
    </div>
  );
}
