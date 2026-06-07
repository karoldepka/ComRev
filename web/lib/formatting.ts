export function formatNumberWithSpaces(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const sign = value < 0 ? '-' : '';
  const [integer, fraction] = Math.abs(value).toString().split('.');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return fraction ? `${sign}${groupedInteger}.${fraction}` : `${sign}${groupedInteger}`;
}

export function formatNumericStringWithSpaces(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const sign = /^[+-]/.test(trimmed) ? trimmed[0] : '';
  const unsigned = sign ? trimmed.slice(1) : trimmed;
  const [integer, fraction] = unsigned.split('.');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return fraction === undefined ? `${sign}${groupedInteger}` : `${sign}${groupedInteger}.${fraction}`;
}
