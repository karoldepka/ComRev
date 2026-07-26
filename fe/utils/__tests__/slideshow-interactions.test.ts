import { describe, expect, it } from 'vitest';

import {
  CANVAS_EDGE_ZONE_RATIO,
  getCanvasDoubleTapAction,
} from '../slideshow-interactions';

describe('getCanvasDoubleTapAction', () => {
  it('navigates in the outer quarter zones', () => {
    expect(CANVAS_EDGE_ZONE_RATIO).toBe(0.25);
    expect(getCanvasDoubleTapAction(0, 1000)).toBe('previous');
    expect(getCanvasDoubleTapAction(249, 1000)).toBe('previous');
    expect(getCanvasDoubleTapAction(751, 1000)).toBe('next');
    expect(getCanvasDoubleTapAction(1000, 1000)).toBe('next');
  });

  it('toggles fullscreen in the center half', () => {
    expect(getCanvasDoubleTapAction(250, 1000)).toBe('fullscreen');
    expect(getCanvasDoubleTapAction(500, 1000)).toBe('fullscreen');
    expect(getCanvasDoubleTapAction(750, 1000)).toBe('fullscreen');
  });

  it('falls back to fullscreen for invalid geometry', () => {
    expect(getCanvasDoubleTapAction(Number.NaN, 1000)).toBe('fullscreen');
    expect(getCanvasDoubleTapAction(100, 0)).toBe('fullscreen');
  });
});
