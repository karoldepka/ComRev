export type CanvasDoubleTapAction = 'previous' | 'fullscreen' | 'next';

export const CANVAS_EDGE_ZONE_RATIO = 0.25;

export function getCanvasDoubleTapAction(
  tapX: number,
  canvasWidth: number,
): CanvasDoubleTapAction {
  if (
    !Number.isFinite(tapX) ||
    !Number.isFinite(canvasWidth) ||
    canvasWidth <= 0
  ) {
    return 'fullscreen';
  }

  const edgeZoneWidth = canvasWidth * CANVAS_EDGE_ZONE_RATIO;
  if (tapX < edgeZoneWidth) return 'previous';
  if (tapX > canvasWidth - edgeZoneWidth) return 'next';
  return 'fullscreen';
}
