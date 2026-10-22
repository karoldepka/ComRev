import { useCallback, useRef, useState } from 'react';

type Column = { id: string; subColumns?: Column[] };
type CursorPos = { row: number; col: number };
type ArrowDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

function keyToCursor(key: string, leafCols: Column[], numRows: number): CursorPos | null {
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
  if (key.startsWith('add-row:')) {
    const colId = key.split(':')[1];
    const idx = leafCols.findIndex((c) => c.id === colId);
    return idx >= 0 ? { row: numRows, col: idx } : null;
  }
  return null;
}

function cursorToKey(
  pos: CursorPos,
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

function keysInRange(
  anchor: CursorPos,
  pos: CursorPos,
  leafCols: Column[],
  leafHeaderKey: Map<string, string>,
  numRows: number,
): string[] {
  const keys: string[] = [];
  for (let r = Math.min(anchor.row, pos.row); r <= Math.max(anchor.row, pos.row); r++) {
    for (let c = Math.min(anchor.col, pos.col); c <= Math.max(anchor.col, pos.col); c++) {
      const key = cursorToKey({ row: r, col: c }, leafCols, leafHeaderKey, numRows);
      if (key) keys.push(key);
    }
  }
  return keys;
}

function movePosition(pos: CursorPos, direction: ArrowDirection, leafColumnCount: number, numRows: number): CursorPos {
  let { row, col } = pos;
  if (direction === 'ArrowUp') {
    if (row === numRows) row = numRows > 0 ? numRows - 1 : -1;
    else if (row > 0) row--;
    else if (row === 0) row = -1;
  }
  if (direction === 'ArrowDown') {
    if (row === -1) row = 0;
    else if (row < numRows) row++;
  }
  if (direction === 'ArrowLeft' && col > 0) col--;
  if (direction === 'ArrowRight' && col < leafColumnCount - 1) col++;
  return { row, col };
}

export function useTableSelection(
  visibleLeafColumns: Column[],
  leafHeaderKey: Map<string, string>,
  numRows: number,
) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState<CursorPos | null>(null);
  const anchorPosRef = useRef<CursorPos | null>(null);
  const selectedKeysRef = useRef(selectedKeys);
  selectedKeysRef.current = selectedKeys;
  // Mouse drag-select: `base` is kept (Ctrl/Cmd-drag adds the range to the existing selection).
  const dragRef = useRef<{ anchorKey: string; anchor: CursorPos; base: string[]; lastKey: string } | null>(null);

  const beginDrag = useCallback((key: string, additive: boolean) => {
    const anchor = keyToCursor(key, visibleLeafColumns, numRows);
    if (!anchor) return;
    dragRef.current = { anchorKey: key, anchor, base: additive ? selectedKeysRef.current : [], lastKey: key };
  }, [visibleLeafColumns, numRows]);

  /** Returns true once the drag has left its starting cell (i.e. it is a range drag, not a click). */
  const extendDrag = useCallback((key: string): boolean => {
    const drag = dragRef.current;
    if (!drag || key === drag.lastKey) return !!drag && drag.lastKey !== drag.anchorKey;
    const pos = keyToCursor(key, visibleLeafColumns, numRows);
    if (!pos) return drag.lastKey !== drag.anchorKey;
    drag.lastKey = key;
    const range = keysInRange(drag.anchor, pos, visibleLeafColumns, leafHeaderKey, numRows);
    setSelectedKeys([...new Set([...drag.base, ...range])]);
    anchorPosRef.current = drag.anchor;
    setCursorPos(pos);
    return true;
  }, [visibleLeafColumns, leafHeaderKey, numRows]);

  /** Returns true if the finished drag was a range drag (the following click should be ignored). */
  const endDrag = useCallback((): boolean => {
    const drag = dragRef.current;
    dragRef.current = null;
    return !!drag && drag.lastKey !== drag.anchorKey;
  }, []);

  const selectKey = useCallback((key: string, multi: boolean, shift?: boolean) => {
    const pos = keyToCursor(key, visibleLeafColumns, numRows);
    if (shift && anchorPosRef.current && pos) {
      setSelectedKeys(keysInRange(anchorPosRef.current, pos, visibleLeafColumns, leafHeaderKey, numRows));
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

  const moveCursor = useCallback((direction: ArrowDirection, extend = false) => {
    setCursorPos((cur) => {
      const pos = cur ?? (numRows > 0 && visibleLeafColumns.length > 0 ? { row: 0, col: 0 } : null);
      if (!pos) return cur;
      const newPos = movePosition(pos, direction, visibleLeafColumns.length, numRows);
      const key = cursorToKey(newPos, visibleLeafColumns, leafHeaderKey, numRows);
      if (extend) {
        const anchor = anchorPosRef.current ?? pos;
        anchorPosRef.current = anchor;
        setSelectedKeys(keysInRange(anchor, newPos, visibleLeafColumns, leafHeaderKey, numRows));
      } else {
        if (key) setSelectedKeys([key]);
        anchorPosRef.current = newPos;
      }
      return newPos;
    });
  }, [visibleLeafColumns, leafHeaderKey, numRows]);

  const selectedSet  = new Set(selectedKeys); // stable reference only needed in render
  const selectedRows = new Set(selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[1]));
  const selectedCols = new Set([
    ...selectedKeys.filter((k) => k.startsWith('cell:')).map((k) => k.split(':')[2]),
    ...selectedKeys.filter((k) => k.startsWith('header:')).map((k) => k.split(':')[1]),
    ...selectedKeys.filter((k) => k.startsWith('add-row:')).map((k) => k.split(':')[1]),
  ]);
  const addRowIsSelected = selectedKeys.some((k) => k.startsWith('add-row:'));

  return {
    selectedKeys, setSelectedKeys,
    cursorPos, setCursorPos,
    selectedSet, selectedRows, selectedCols,
    addRowIsSelected,
    selectKey,
    moveCursor,
    beginDrag, extendDrag, endDrag,
    cursorToKey: (pos: CursorPos) =>
      cursorToKey(pos, visibleLeafColumns, leafHeaderKey, numRows),
  };
}
