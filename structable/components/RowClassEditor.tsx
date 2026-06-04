'use client';

import React from 'react';
import { nanoid } from 'nanoid';
import ItemPicker, { type PickerItem } from './ItemPicker';
import type { RowClass } from '../types/table';

const CLASS_COLORS = [
  '#6366f1', '#f97316', '#16a34a', '#dc2626',
  '#2563eb', '#9333ea', '#d97706', '#0891b2',
];

type Props = {
  tableId: string;
  availableClasses: RowClass[];
  selectedClassIds: string[];
  onConfirm: (selectedIds: string[], newClasses: RowClass[]) => void;
  onClose: () => void;
  anchor: { top: number; left: number };
};

export default function RowClassEditor({
  tableId,
  availableClasses,
  selectedClassIds,
  onConfirm,
  onClose,
  anchor,
}: Props) {
  const items: PickerItem[] = availableClasses.map((cls) => ({
    id: cls.id,
    label: cls.name,
    color: cls.color,
  }));

  function handleConfirm(selectedIds: string[], newItems: PickerItem[]) {
    const newClasses: RowClass[] = newItems.map((item) => ({
      id: item.id,
      table_id: tableId,
      name: item.label,
      color: item.color ?? null,
    }));
    onConfirm(selectedIds, newClasses);
  }

  return (
    <ItemPicker
      items={items}
      selectedIds={selectedClassIds}
      onConfirm={handleConfirm}
      onClose={onClose}
      anchor={anchor}
      title="Row Classes"
      allowCreate
      createItem={(label, color) => ({ id: nanoid(), label, color: color ?? null })}
      colorChoices={CLASS_COLORS}
    />
  );
}
