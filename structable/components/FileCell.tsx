'use client';

import React, { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import AudioPlayer from './AudioPlayer';
import { addFile, fileUrl, formatBytes, type FileRef } from '../services/fileStore';

type Props = {
  files: FileRef[];
  editable: boolean;
  onChange: (files: FileRef[]) => void;
};

function FilePreview({ file }: { file: FileRef }) {
  const url = fileUrl(file);
  if (file.mime_type.startsWith('audio/')) return <AudioPlayer src={url} name={file.name} />;
  if (file.mime_type.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title={file.name} onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- user file served by our API */}
        <img className="file-thumb" src={url} alt={file.name} />
      </a>
    );
  }
  return (
    <a className="file-chip" href={url} target="_blank" rel="noopener noreferrer" download={file.name} onClick={(e) => e.stopPropagation()}>
      <Paperclip size={12} /> <span className="file-chip-name">{file.name}</span> <span className="file-chip-size">{formatBytes(file.size_bytes)}</span>
    </a>
  );
}

/** Cell holding a list of files: audio gets a waveform player; add via button or drag & drop. */
export default function FileCell({ files, editable, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (list: FileList) => {
    try {
      const refs = await Promise.all([...list].map(addFile));
      onChange([...files, ...refs]);
    } catch (err) {
      toast.error(`Could not add file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div
      className={`file-cell${dragOver ? ' file-cell-drag-over' : ''}`}
      onDragOver={(e) => { if (editable && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!editable || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragOver(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      {files.length === 0 && !editable && '-'}
      {files.map((file) => (
        <div key={file.id} className="file-item">
          <FilePreview file={file} />
          {editable && (
            <button
              type="button"
              className="file-remove"
              aria-label={`Remove ${file.name}`}
              onClick={(e) => { e.stopPropagation(); onChange(files.filter((candidate) => candidate.id !== file.id)); }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <>
          <button type="button" className="file-add" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
            + File
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}
