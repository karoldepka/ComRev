'use client';

import React, { useEffect } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../ui/command';
import type { AllRowSearchState } from '../../hooks/useAllRowSearch';
import type { GlobalSearchResult } from './search';

const RESULT_GROUPS: { kind: GlobalSearchResult['kind']; heading: string }[] = [
  { kind: 'column', heading: 'Columns' },
  { kind: 'displayed-row', heading: 'Displayed Rows' },
  { kind: 'all-row', heading: 'All Rows' },
];

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  results: GlobalSearchResult[];
  allRowSearch: AllRowSearchState;
  onActivate: (result: GlobalSearchResult) => void;
  onClose: () => void;
};

export default function GlobalSearchDialog({ query, onQueryChange, results, allRowSearch, onActivate, onClose }: Props) {
  const hasTerm = query.trim().length > 0;

  useEffect(() => {
    const focusTimer = setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[cmdk-input]');
      input?.focus();
      input?.select();
    }, 0);
    return () => clearTimeout(focusTimer);
  }, []);

  return (
    <CommandDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Command shouldFilter={false}>
        <div className="flex items-center border-b border-app-border">
          <CommandInput value={query} onValueChange={onQueryChange} placeholder="Search columns and rows" />
          <CommandShortcut className="mr-3 hidden rounded-app border border-app-border bg-app-soft px-2 py-1 font-semibold tracking-normal sm:inline-block">
            Ctrl Alt F
          </CommandShortcut>
        </div>
        <CommandList>
          {hasTerm && RESULT_GROUPS.map(({ kind, heading }) => {
            const groupResults = results.filter((result) => result.kind === kind);
            if (groupResults.length === 0) return null;
            return (
              <CommandGroup key={kind} heading={heading}>
                {groupResults.map((result) => (
                  <CommandItem key={result.id} value={result.id} onSelect={() => onActivate(result)}>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{result.title}</span>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-app-muted">{result.detail}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          {hasTerm && results.length === 0 && !allRowSearch.loading && !allRowSearch.error && (
            <CommandEmpty>No matches</CommandEmpty>
          )}
          {hasTerm && allRowSearch.loading && (
            <div className="px-3 py-4 text-sm text-app-muted">Searching all rows...</div>
          )}
          {hasTerm && allRowSearch.error && (
            <div className="px-3 py-4 text-sm text-app-danger">All-row search failed: {allRowSearch.error}</div>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
