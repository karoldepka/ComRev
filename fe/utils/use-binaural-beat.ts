import { useEffect } from 'react';

/**
 * Generates a binaural beat via Web Audio API.
 * Left ear: carrier Hz  |  Right ear: carrier + beatHz
 * The brain perceives the difference as a beat at beatHz.
 * Requires headphones to work.
 */
export function useBinauralBeat({
  beatHz,
  carrier = 200,
  volume = 0.35,
}: {
  beatHz: number;
  carrier?: number;
  volume?: number;
}) {
  useEffect(() => {
    if (!beatHz || typeof window === 'undefined') return;

    const AudioCtor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return;

    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtor() as AudioContext;
      ctx.resume().catch(() => undefined);

      // Two oscillators routed to separate stereo channels
      const merger = ctx.createChannelMerger(2);
      const gain = ctx.createGain();
      gain.gain.value = volume;

      const left = ctx.createOscillator();
      left.type = 'sine';
      left.frequency.value = carrier;

      const right = ctx.createOscillator();
      right.type = 'sine';
      right.frequency.value = carrier + beatHz;

      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      merger.connect(gain);
      gain.connect(ctx.destination);

      left.start();
      right.start();
    } catch (err) {
      console.warn('useBinauralBeat: failed to start:', err);
    }

    return () => {
      ctx?.close().catch(() => undefined);
    };
  }, [beatHz, carrier, volume]);
}
