'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type WaveSurfer from 'wavesurfer.js';
import logger from '../utils/logger';

const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

type Props = { src: string; name: string };

/**
 * Compact waveform player for a table cell. wavesurfer.js is loaded and the audio fetched only on
 * first play, so tables with many audio cells stay light.
 */
export default function AudioPlayer({ src, name }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => waveRef.current?.destroy(), []);

  const ensurePlayer = async (): Promise<WaveSurfer> => {
    if (waveRef.current) return waveRef.current;
    const { default: WaveSurferLib } = await import('wavesurfer.js');
    const player = WaveSurferLib.create({
      container: containerRef.current!,
      url: src,
      height: 26,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      cursorWidth: 1,
      normalize: true,
      waveColor: cssVar('--border-strong', '#94a3b8'),
      progressColor: cssVar('--color-primary', '#f97316'),
      cursorColor: cssVar('--color-secondary', '#2563eb'),
    });
    player.on('ready', (seconds) => setDuration(seconds));
    player.on('timeupdate', (seconds) => setTime(seconds));
    player.on('audioprocess', (seconds) => setTime(seconds));
    player.on('play', () => setPlaying(true));
    player.on('pause', () => setPlaying(false));
    player.on('finish', () => setPlaying(false));
    player.on('error', (err) => {
      logger.error({ err, src }, 'audio player failed to load');
      setError('Cannot play this file');
    });
    waveRef.current = player;
    setStarted(true);
    return player;
  };

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await (await ensurePlayer()).playPause();
    } catch (err) {
      logger.error({ err, src }, 'audio playback failed');
      setError('Cannot play this file');
    }
  };

  return (
    <div className="audio-player" title={name}>
      <button type="button" className="audio-play" onClick={toggle} aria-label={playing ? `Pause ${name}` : `Play ${name}`}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="audio-wave" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        {!started && <span className="audio-name">{name}</span>}
      </div>
      <span className="audio-time">
        {error ?? (duration === null ? (started ? '…' : '') : `${formatTime(time)} / ${formatTime(duration)}`)}
      </span>
    </div>
  );
}
