export type ColType = "boolean" | "text" | "number" | "mixed";

export interface ColNode {
  id: string;
  name: string;
  colType: ColType;
  children: ColNode[];
}

export interface RowData {
  id: string;
  name: string;
  [key: string]: unknown;
}

// Augment TanStack Table ColumnMeta so we can store colType on column defs
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    colType?: ColType;
  }
}
