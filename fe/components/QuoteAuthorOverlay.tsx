import React from 'react';
import { Text } from 'react-native';

/** Bottom-right attribution caption for quote slides, overlaid on the 3D canvas — same HTML-overlay approach as SlideImageOverlay. */
export function QuoteAuthorOverlay({ author }: { author?: string }) {
  if (!author) return null;
  return (
    <Text style={quoteAuthorStyle as any} numberOfLines={1}>
      {'— ' + author}
    </Text>
  );
}

const quoteAuthorStyle = {
  position: 'absolute' as const,
  bottom: 20,
  right: 24,
  zIndex: 8,
  pointerEvents: 'none' as const,
  fontSize: 20,
  fontStyle: 'italic' as const,
  color: 'rgba(255,255,255,0.85)',
  textShadowColor: 'rgba(0,0,0,0.7)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 5,
};
