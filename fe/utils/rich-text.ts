export interface RichTextSegment {
  text: string;
  bold: boolean;
}

interface RichTextWord {
  segments: RichTextSegment[];
  visibleLength: number;
}

function pushSegment(
  segments: RichTextSegment[],
  text: string,
  bold: boolean,
): void {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous?.bold === bold) {
    previous.text += text;
    return;
  }
  segments.push({ text, bold });
}

export function parseBoldSegments(text: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let bold = false;
  let buffer = "";

  for (let index = 0; index < text.length; index++) {
    const remaining = text.slice(index).toLowerCase();
    if (remaining.startsWith("<b>")) {
      pushSegment(segments, buffer, bold);
      buffer = "";
      bold = true;
      index += 2;
      continue;
    }
    if (remaining.startsWith("</b>")) {
      pushSegment(segments, buffer, bold);
      buffer = "";
      bold = false;
      index += 3;
      continue;
    }
    buffer += text[index];
  }

  pushSegment(segments, buffer, bold);
  return segments;
}

export function stripBoldTags(text: string): string {
  return parseBoldSegments(text)
    .map((segment) => segment.text)
    .join("");
}

function tokenizeRichTextWords(line: string): RichTextWord[] {
  const words: RichTextWord[] = [];
  let current: RichTextWord | null = null;

  for (const segment of parseBoldSegments(line)) {
    const chunks = segment.text.match(/\s+|\S+/g) ?? [];
    for (const chunk of chunks) {
      if (/^\s+$/.test(chunk)) {
        if (current) {
          words.push(current);
          current = null;
        }
        continue;
      }

      current ??= { segments: [], visibleLength: 0 };
      pushSegment(current.segments, chunk, segment.bold);
      current.visibleLength += chunk.length;
    }
  }

  if (current) words.push(current);
  return words;
}

function serializeRichTextWord(word: RichTextWord): string {
  return word.segments
    .map((segment) => (segment.bold ? `<b>${segment.text}</b>` : segment.text))
    .join("");
}

function serializeRichTextLine(words: RichTextWord[]): string {
  return words.map(serializeRichTextWord).join(" ");
}

export function wrapRichTextWords(text: string, maxChars = 12): string {
  return text
    .split("\n")
    .map((line) => {
      const words = tokenizeRichTextWords(line);
      if (words.length === 0) return line;

      const lines: RichTextWord[][] = [];
      let current: RichTextWord[] = [];
      let currentLength = 0;

      for (const word of words) {
        const nextLength =
          current.length === 0
            ? word.visibleLength
            : currentLength + 1 + word.visibleLength;

        if (current.length === 0 || nextLength <= maxChars) {
          current.push(word);
          currentLength = nextLength;
          continue;
        }

        lines.push(current);
        current = [word];
        currentLength = word.visibleLength;
      }

      if (current.length > 0) lines.push(current);
      return lines.map(serializeRichTextLine).join("\n");
    })
    .join("\n");
}
