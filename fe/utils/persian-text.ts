import { PersianShaper } from 'arabic-persian-reshaper';

/**
 * three.js's TextGeometry renders one glyph per codepoint in string order —
 * no contextual letter shaping and no bidi/RTL reordering. Persian (and
 * Arabic) need both: each letter's glyph shape depends on its isolated/
 * initial/medial/final position in the word, and the whole line reads
 * right-to-left. PersianShaper.convertArabic() handles the first part,
 * substituting each letter for the Unicode Arabic Presentation Forms
 * codepoint matching its position — which is exactly the set of glyphs
 * scripts/generate-persian-font.mjs carried into the bundled Vazirmatn
 * typeface.json. It does NOT reorder for RTL (confirmed by inspection: the
 * output stays in logical/input order), so that half is done here by
 * reversing the shaped result.
 */
export function reshapeForRtlDisplay(line: string): string {
  const shaped = PersianShaper.convertArabic(line);
  return Array.from(shaped).reverse().join('');
}
