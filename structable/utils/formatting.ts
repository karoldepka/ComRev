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

type FormatCellOptions = {
  formatNumericStrings?: boolean;
};

export function formatCell(value: unknown, options: FormatCellOptions = {}): string {
  if (value === null || value === undefined) return '-';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(String(value))) {
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumberWithSpaces(value);
  if (options.formatNumericStrings && typeof value === 'string') {
    return formatNumericStringWithSpaces(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'number') return formatNumberWithSpaces(item);
        if (options.formatNumericStrings && typeof item === 'string') {
          return formatNumericStringWithSpaces(item) ?? item;
        }
        return item ?? '';
      })
      .join(', ');
  }
  return String(value);
}
