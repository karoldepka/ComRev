export interface ParsedDataUrl {
  mediaType: string;
  parameters: string[];
  isBase64: boolean;
  data: string;
}

type BufferLike = {
  from(
    input: string | Uint8Array,
    encoding?: string,
  ): { toString(encoding?: string): string };
};

function getBuffer(): BufferLike | undefined {
  return (globalThis as unknown as { Buffer?: BufferLike }).Buffer;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return binary;
}

function binaryStringToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeUtf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}

function decodeUtf8Bytes(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(encoded);
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  if (!dataUrl.startsWith('data:')) return null;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return null;

  const metadata = dataUrl.slice(5, commaIndex);
  const parts = metadata.split(';').filter(Boolean);
  const firstPartIsMediaType = Boolean(parts[0]?.includes('/'));
  const mediaType = firstPartIsMediaType ? parts[0].toLowerCase() : '';
  const rawParameters = firstPartIsMediaType ? parts.slice(1) : parts;
  const isBase64 = rawParameters.some(
    (parameter) => parameter.toLowerCase() === 'base64',
  );
  const parameters = rawParameters.filter(
    (parameter) => parameter.toLowerCase() !== 'base64',
  );

  return {
    mediaType,
    parameters,
    isBase64,
    data: dataUrl.slice(commaIndex + 1),
  };
}

export function decodeBase64Bytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    return binaryStringToBytes(atob(base64));
  }
  const Buffer = getBuffer();
  if (Buffer) {
    return new Uint8Array(
      Buffer.from(base64, 'base64') as unknown as Uint8Array,
    );
  }
  throw new Error('No base64 decoder is available in this environment.');
}

export function encodeBase64Bytes(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    return btoa(bytesToBinaryString(bytes));
  }
  const Buffer = getBuffer();
  if (Buffer) {
    return Buffer.from(bytes).toString('base64');
  }
  throw new Error('No base64 encoder is available in this environment.');
}

export function decodeDataUrlBytes(dataUrl: string): Uint8Array | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    if (parsed.isBase64) return decodeBase64Bytes(parsed.data);
    return encodeUtf8Bytes(decodeURIComponent(parsed.data));
  } catch {
    return null;
  }
}

export function decodeDataUrlArrayBuffer(dataUrl: string): ArrayBuffer | null {
  const bytes = decodeDataUrlBytes(dataUrl);
  if (!bytes) return null;
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function decodeTextDataUrl(dataUrl: string): string | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    if (parsed.isBase64) return decodeUtf8Bytes(decodeBase64Bytes(parsed.data));
    return decodeURIComponent(parsed.data);
  } catch {
    return null;
  }
}

export function encodeTextDataUrl(
  text: string,
  mediaType = 'text/plain;charset=utf-8',
): string {
  return `data:${mediaType};base64,${encodeBase64Bytes(encodeUtf8Bytes(text))}`;
}

export function isSvgDataUrl(dataUrl: string): boolean {
  return parseDataUrl(dataUrl)?.mediaType === 'image/svg+xml';
}

export function decodeSvgDataUrl(dataUrl: string): string | null {
  if (!isSvgDataUrl(dataUrl)) return null;
  return decodeTextDataUrl(dataUrl);
}

export function encodeSvgDataUrl(svgText: string): string {
  return encodeTextDataUrl(svgText, 'image/svg+xml');
}
