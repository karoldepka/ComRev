import { useCallback, useRef, useState } from 'react';

type Column = { id: string; subColumns?: Column[] };

function keyToCursor(key: string, leafCols: Column[]): { row: number; col: number } | null {
  if (key.startsWith('header:')) {
    const colId = key.split(':')[1];
    const idx = leafCols.findIndex((c) => c.id === colId);
    return idx >= 0 ? { row: -1, col: idx } : null;
  }
  if (key.startsWith('cell:')) {
    const parts = key.split(':');
    const idx = leafCols.findIndex((c) => c.id === parts[2]);
    return idx >= 0 ? { row: parseInt(parts[1], 10), col: idx } : null;
  }
  return null;
}

function cursorToKey(
  pos: { row: number; col: number },
  leafCols: Column[],
  leafHeaderKey: Map<string, string>,
  numRows: number,
): string | null {
  if (pos.col < 0 || pos.col >= leafCols.length) return null;
  const col = leafCols[pos.col];
  if (pos.row === -1) return leafHeaderKey.get(col.id) ?? null;
  if (pos.row === numRows) return `add-row:${col.id}`;
  if (pos.row < 0 || pos.row >= numRows) return null;
  return `cell:${pos.row}:${col.id}`;
}

export function useTableSelection(
  visibleLeafColumns: Column[],
  leafHeaderKey: Map<string, string>,
  numRows: number,
) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState<{ row: number; col: number } | null>(null);
  const anchorPosRef = useRef<{ row: number; col: number } | null>(null);

  const selectKey = useCallback((key: string, multi: boolean, shift?: boolean) => {
    const pos = keyToCursor(key, visibleLeafColumns);
    if (shift && anchorPosRef.current && pos) {
      const anchor = anchorPosRef.current;
      const newKeys: string[] = [];
      for (let r = Math.min(anchor.row, pos.row); r <= Math.max(anchor.row, pos.row); r++) {
        for (let c = Math.min(anchor.col, pos.col); c <= Math.max(anchor.col, pos.col); c++) {
          const k = cursorToKey({ row: r, col: c }, visibleLeafColumns, leafHeaderKey, numRows);
          if (k) newKeys.push(k);
        }
      }
      setSelectedKeys(newKeys);
      setCursorPos(pos);
    } else {
      setSelectedKeys((prev) => {
        const has = prev.includes(key);
        if (multi) return has ? prev.filter((k) => k !== key) : [...prev, key];
        return [key]; // single-click always selects; deselecting by re-clicking is non-standard in spreadsheets
      });
      if (!multi) anchorPosRef.current = pos;
      setCursorPos(pos);
    }
  }, [visibleLeafColumns, leafHeaderKey, numRows]);

  const moveCursor = useCallback((direction: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
    setCursorPos((cur) => {
      const pos = cur ?? (numRows > 0 && visibleLeafColumns.length > 0 ? { row: 0, col: 0 } : null);
      if (!pos) return cur;
      let { row, col } = pos;
      if (direction === 'ArrowUp')    { if (row === numRows) row = numRows > 0 ? numRows - 1 : -1; else if (row > 0) row--; else if (row === 0) row = -1; }
      if (direction === 'ArrowDown')  { if (row === -1) row = 0; else if (row < numRows) row++; }
      if (direction === 'ArrowLeft')  { if (col > 0) col--; }
      if (direction === 'ArrowRight') { if (col < visibleLeafColumns.length - 1) col++; }
      const newPos = { row, col };
      const key = cursorToKey(newPos, visibleLeafColumns, leafHeaderKey, numRows);
      if (key) setSelectedKeys([key]);
      return newPos;
    });
  }, [visibleLeafColumns, leafHeaderKey, numRows]);

  const selectedSet  = new Set(selectedKeys); // stable reference only needed in render
  const selectedRows = new Set(selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[1]));
  const selectedCols = new Set([
    ...selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[2]),
    ...selectedKeys.filter((k) => k.startsWith('header:')).map((k) => k.split(':')[1]),
  ]);

  return {
    selectedKeys, setSelectedKeys,
    cursorPos, setCursorPos,
    selectedSet, selectedRows, selectedCols,
    selectKey,
    moveCursor,
    cursorToKey: (pos: { row: number; col: number }) =>
      cursorToKey(pos, visibleLeafColumns, leafHeaderKey, numRows),
  };
}
