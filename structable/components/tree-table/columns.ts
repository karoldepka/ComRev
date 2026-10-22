import type { ColumnGroup } from '../../hooks/useColumnPrefs';
import type { ColumnDataType } from '../AddColumnDialog';
import { isRatingColumnType } from '../RatingStars';
import type { ColType } from '../../utils/columnFilters';
import logger from '../../utils/logger';
import type { ApiCustomColumn, DataRow } from '../../types/table';
import type { StoredSort } from '../../services/localStore';

/** `sort` query param for the rows API: `col:dir[:type]`. */
export function sortParam(sort: StoredSort, customColumns: ApiCustomColumn[]): string {
  const sortColumn = customColumns.find((cc) => cc.id === sort.col);
  const sortType = sortColumn?.data_types?.[0] ?? sort.colType ?? sortColumn?.types?.[0];
  return sortType ? `${sort.col}:${sort.dir}:${sortType}` : `${sort.col}:${sort.dir}`;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const ADD_COL_VIRTUAL_ID = '__add-col__';
export const ADD_COL_HEADER_KEY = `header:${ADD_COL_VIRTUAL_ID}:0`;
export const ADD_COL_VIRTUAL_COLUMN = { id: ADD_COL_VIRTUAL_ID, label: '+' };

export const ROW_NUM_COL_ID = '__row_num__';
export const ROW_NUM_COL_MIN_WIDTH = 40;

export const CLASSES_COL_ID = 'classes';
export const FULL_NAME_COL_ID = 'full_name';
export const ID_COL_ID = 'id';
export const PARENT_CHILD_FIELD_ID = 'parent_child';
export const TABLES_TABLE_ID = 'tables';
export const TABLES_TABLE_PATH = '/tables';
export const OPENABLE_TABLE_CELL_COLUMNS = new Set([ID_COL_ID, FULL_NAME_COL_ID]);

// ── Local types ────────────────────────────────────────────────────────────────

export type Column = {
  id: string;
  label: string;
  width?: number;
  minWidth?: number;
  customColumnId?: string;
  readOnly?: boolean;
  isFrozen?: boolean;
  types?: string[];
  filterType?: ColType | null;
  sourcePath?: string[] | null;
  subColumns?: Column[];
};

export const CLASSES_COLUMN: Column = {
  id: CLASSES_COL_ID,
  label: 'Classes',
  width: 160,
  minWidth: 120,
  readOnly: true,
  types: ['jsonb'],
};

export type HeaderCell = { column: Column; colSpan: number; rowSpan: number; depth: number };
export type TreeRow = {
  row: DataRow;
  rowId: string;
  depth: number;
  parentId: string | null;
  childIds: string[];
  hasChildren: boolean;
  isExpanded: boolean;
};

// ── Utility functions ──────────────────────────────────────────────────────────

export function labelFor(key: string): string {
  if (key === 'stars_diff') return 'Stars diff';
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function columnLabel(cc: ApiCustomColumn): string {
  const title = cc.title?.trim();
  return title && title.length > 0 ? title : labelFor(cc.id);
}

export function rowClassIds(row: DataRow | undefined): string[] {
  const value = row?.[CLASSES_COL_ID];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function relationshipIds(row: DataRow | undefined, fieldId: string): string[] {
  const value = row?.[fieldId];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function appendUniqueId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

export function insertIdAfter(ids: string[], afterId: string | null | undefined, id: string): string[] {
  const withoutId = ids.filter((candidate) => candidate !== id);
  if (!afterId) return [...withoutId, id];
  const idx = withoutId.indexOf(afterId);
  if (idx < 0) return [...withoutId, id];
  return [...withoutId.slice(0, idx + 1), id, ...withoutId.slice(idx + 1)];
}

export function deriveColumns(row: DataRow): Column[] {
  const keys = Object.keys(row);
  const sorted = [
    ...(keys.includes(FULL_NAME_COL_ID) ? [FULL_NAME_COL_ID] : []),
    ...(keys.includes('name') ? ['name'] : []),
    ...keys.filter((k) => k !== FULL_NAME_COL_ID && k !== 'name'),
  ];
  return sorted.map((key) => {
    const val = row[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return {
        id: key,
        label: labelFor(key),
        width: 80,
        minWidth: 40,
        subColumns: Object.keys(val as Record<string, unknown>).map((sub) => ({
          id: `${key}__${sub}`,
          label: sub,
          width: 70,
          minWidth: 40,
          sourcePath: [key, sub],
        })),
      };
    }
    return { id: key, label: labelFor(key), width: 120, minWidth: 60, isFrozen: key === FULL_NAME_COL_ID };
  });
}

export function isColumnReadOnly(cc: ApiCustomColumn): boolean {
  return cc.readOnly ?? cc.read_only ?? !(cc.is_editable ?? true);
}

export function columnTypesForDataType(columnType: ColumnDataType): { types: string[]; data_types: string[] } {
  if (columnType === 'rating') return { types: ['rating'], data_types: ['numeric'] };
  return { types: ['text'], data_types: ['text'] };
}

export function isRatingColumn(column: Column): boolean {
  return isRatingColumnType(column.types);
}

export function insertPositioned(
  list: Column[],
  col: Column,
  positionBefore: string | null | undefined,
  positionAfter: string | null | undefined,
): void {
  const afterIdx = positionAfter
    ? list.findIndex((c) => c.id === positionAfter || c.customColumnId === positionAfter)
    : -1;
  if (afterIdx >= 0) {
    list.splice(afterIdx + 1, 0, col);
    return;
  }
  const beforeIdx = positionBefore
    ? list.findIndex((c) => c.id === positionBefore || c.customColumnId === positionBefore)
    : -1;
  list.splice(beforeIdx >= 0 ? beforeIdx : list.length, 0, col);
}

export function columnsFromMetadata(customColumns: ApiCustomColumn[], _rowSample?: DataRow): Column[] {
  const colMap = new Map<string, Column>();
  const syntheticRootIds = new Set<string>();
  for (const cc of customColumns) {
    if (!cc.id) {
      logger.error({ column: cc }, 'custom column metadata missing id');
      continue;
    }
    colMap.set(cc.id, {
      id: cc.id,
      customColumnId: cc.id,
      label: columnLabel(cc),
      width: 150,
      minWidth: 60,
      readOnly: isColumnReadOnly(cc),
      isFrozen: cc.is_frozen ?? false,
      types: cc.types ?? ['text'],
      filterType: (cc.data_types?.[0] as ColType | undefined) ?? null,
      sourcePath: cc.source_path ?? null,
    });
  }

  const root: Column[] = [];
  for (const cc of customColumns) {
    const col = colMap.get(cc.id);
    if (!col) continue;
    const parentId = cc.parent_ids?.length ? cc.parent_ids[cc.parent_ids.length - 1] : null;
    let parentCol = parentId ? colMap.get(parentId) : null;
    if (parentId && !parentCol) {
      parentCol = {
        id: parentId,
        customColumnId: parentId,
        label: labelFor(parentId),
        width: 150,
        minWidth: 60,
        readOnly: true,
        subColumns: [],
      };
      colMap.set(parentId, parentCol);
      syntheticRootIds.add(parentId);
    }
    if (parentCol) {
      if (!parentCol.subColumns) parentCol.subColumns = [];
      insertPositioned(parentCol.subColumns, col, cc.position_before, cc.position_after);
    } else {
      insertPositioned(root, col, cc.position_before, cc.position_after);
    }
  }
  for (const id of syntheticRootIds) {
    const col = colMap.get(id);
    if (col) insertPositioned(root, col, null, null);
  }
  return root;
}

export function getLeafColumns(cols: Column[]): Column[] {
  return cols.flatMap((c) => (c.subColumns ? getLeafColumns(c.subColumns) : [c]));
}

export function getVisibleLeafColumns(col: Column, hidden: Set<string>): Column[] {
  if (!col.subColumns?.length) return hidden.has(col.id) ? [] : [col];
  return col.subColumns.flatMap((ch) => getVisibleLeafColumns(ch, hidden));
}

export function getColumnDepth(cols: Column[]): number {
  return cols.reduce((d, c) => Math.max(d, c.subColumns ? 1 + getColumnDepth(c.subColumns) : 1), 0);
}

export function buildHeaderRows(cols: Column[], maxDepth: number, hidden: Set<string>): HeaderCell[][] {
  const rows: HeaderCell[][] = Array.from({ length: maxDepth }, () => []);

  function traverse(col: Column, depth: number): { colSpan: number; visible: boolean } {
    const isLeaf = !col.subColumns?.length;
    if (isLeaf) {
      if (hidden.has(col.id)) return { colSpan: 0, visible: false };
      rows[depth - 1].push({ column: col, colSpan: 1, rowSpan: maxDepth - depth + 1, depth });
      return { colSpan: 1, visible: true };
    }
    const childResults = col.subColumns!.map((ch) => traverse(ch, depth + 1));
    const colSpan = childResults.reduce((s, r) => s + (r.visible ? r.colSpan : 0), 0);
    if (colSpan === 0) return { colSpan: 0, visible: false };
    rows[depth - 1].push({ column: col, colSpan, rowSpan: 1, depth });
    return { colSpan, visible: true };
  }

  cols.forEach((c) => traverse(c, 1));
  return rows.map((r) => r.filter((cell) => cell.colSpan > 0));
}

export function applyColumnGroups(flatCols: Column[], groups: ColumnGroup[]): Column[] {
  if (groups.length === 0) return flatCols;
  const groupByChild = new Map<string, ColumnGroup>();
  for (const g of groups) {
    for (const cid of g.childIds) groupByChild.set(cid, g);
  }
  const result: Column[] = [];
  const processedGroups = new Set<string>();
  for (const col of flatCols) {
    const group = groupByChild.get(col.id);
    if (!group) { result.push(col); continue; }
    if (processedGroups.has(group.id)) continue;
    processedGroups.add(group.id);
    const children = flatCols.filter((c) => group.childIds.includes(c.id));
    result.push({ id: group.id, label: group.label, subColumns: children });
  }
  return result;
}
