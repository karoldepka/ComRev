import { describe, expect, it } from 'vitest';

import { stripBoldTags, wrapRichTextWords } from '../rich-text';

describe('rich text utilities', () => {
  it('strips bold markers for plain text previews', () => {
    expect(stripBoldTags('Not problems, but <b>challenges</b>')).toBe(
      'Not problems, but challenges',
    );
  });

  it('preserves bold markers when wrapping rich 3D text', () => {
    expect(wrapRichTextWords('Not problems, but <b>challenges</b>', 12)).toBe(
      'Not\nproblems,\nbut\n<b>challenges</b>',
    );
  });
});
