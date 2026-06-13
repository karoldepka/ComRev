import { isSvgDataUrl, processSvgDataUrl } from '@/utils/image-sources';
import React from 'react';

export type SlideImagePosition =
  | "background"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface SlideImage {
  id: string;
  imageUrl: string;
  imagePosition: SlideImagePosition;
  opacity: number;
  contrast: number;
  brightness: number;
  scale: number;
  svgColor?: string;
  svgStrokeWidth?: number;
}

export function slideImageStyle(img: SlideImage): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 8,
    opacity: img.opacity,
    filter: `contrast(${img.contrast}) brightness(${img.brightness})`,
    transform: `scale(${img.scale ?? 1})`,
    transformOrigin: "center center",
  };
  if (img.imagePosition === "background") {
    return { ...base, inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  }
  const isSvg = isSvgDataUrl(img.imageUrl);
  return {
    ...base,
    width: 200,
    height: 140,
    objectFit: isSvg ? "contain" : "cover",
    ...(img.imagePosition === "top-left"     ? { top: 16, left: 16 }    : {}),
    ...(img.imagePosition === "top-right"    ? { top: 16, right: 16 }   : {}),
    ...(img.imagePosition === "bottom-left"  ? { bottom: 16, left: 16 } : {}),
    ...(img.imagePosition === "bottom-right" ? { bottom: 60, right: 16 } : {}),
  };
}

export function SlideImageOverlay({ images }: { images: SlideImage[] }) {
  if (!images.length) return null;
  return (
    <>
      {images.map((img) => {
        const src = isSvgDataUrl(img.imageUrl)
          ? processSvgDataUrl(img.imageUrl, img.svgColor ?? '#ffffff', img.svgStrokeWidth)
          : img.imageUrl;
        return <img key={img.id} src={src} style={slideImageStyle(img) as any} alt="" />;
      })}
    </>
  );
}
