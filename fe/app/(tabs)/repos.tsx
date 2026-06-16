import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ColumnDef,
  ExpandedState,
  Row,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

interface Repo {
  id: number;
  name: string;
  url: string;
  stars: number;
  pushed_at: string;
  description: string | null;
  language: string | null;
  forks: number;
  open_issues: number;
  owner_login: string | null;
  topics: string[];
  stars_diff_1day: number;
  stars_diff_2days: number;
}

interface TreeRow {
  name: string;
  stars: number | null;
  language: string;
  forks: number | null;
  description: string | null;
  subRows?: TreeRow[];
  _isGroup?: boolean;
}

function buildTree(repos: Repo[]): TreeRow[] {
  const grouped: Record<string, Repo[]> = {};
  for (const repo of repos) {
    const lang = repo.language || "Unknown";
    if (!grouped[lang]) grouped[lang] = [];
    grouped[lang].push(repo);
  }

  return Object.entries(grouped)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([lang, items]) => ({
      name: `${lang} (${items.length})`,
      stars: items.reduce((sum, r) => sum + r.stars, 0),
      language: lang,
      forks: items.reduce((sum, r) => sum + r.forks, 0),
      description: null,
      _isGroup: true,
      subRows: items.map((r) => ({
        name: r.name,
        stars: r.stars,
        language: r.language || "Unknown",
        forks: r.forks,
        description: r.description,
      })),
    }));
}

import { API_BASE } from '@/utils/api-config';

export default function ReposScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState>(true);

  useEffect(() => {
    fetch(`${API_BASE}/repo/?limit=200`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setRepos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => buildTree(repos), [repos]);

  const columns = useMemo<ColumnDef<TreeRow, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row, getValue }) => (
          <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: row.depth * 16 }}>
            {row.getCanExpand() ? (
              <Pressable onPress={row.getToggleExpandedHandler()} hitSlop={8}>
                <ThemedText style={styles.expander}>
                  {row.getIsExpanded() ? "▼" : "▶"}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={{ width: 18 }} />
            )}
            <ThemedText
              numberOfLines={1}
              style={[styles.cell, styles.nameCell, row.original._isGroup && styles.groupName]}
            >
              {getValue()}
            </ThemedText>
          </View>
        ),
      },
      {
        accessorKey: "stars",
        header: "Stars",
        cell: ({ getValue }) => (
          <ThemedText style={[styles.cell, styles.numCell]}>
            {getValue()?.toLocaleString() ?? ""}
          </ThemedText>
        ),
      },
      {
        accessorKey: "forks",
        header: "Forks",
        cell: ({ getValue }) => (
          <ThemedText style={[styles.cell, styles.numCell]}>
            {getValue()?.toLocaleString() ?? ""}
          </ThemedText>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ getValue }) => (
          <ThemedText numberOfLines={1} style={[styles.cell, styles.descCell]}>
            {getValue() ?? ""}
          </ThemedText>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={colors.tint} />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Error: {error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Repositories
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {repos.length} repos grouped by language
      </ThemedText>
      <ScrollView horizontal>
        <View>
          <View style={[styles.headerRow, { borderBottomColor: colors.icon }]}>
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header) => (
                <View key={header.id} style={[styles.headerCell, { width: getColWidth(header.id) }]}>
                  <ThemedText style={styles.headerText}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </ThemedText>
                </View>
              ))
            )}
          </View>
          <ScrollView style={styles.body}>
            {table.getRowModel().rows.map((row) => (
              <View
                key={row.id}
                style={[
                  styles.row,
                  { borderBottomColor: colors.icon + "33" },
                  row.original._isGroup && styles.groupRow,
                ]}
              >
                {row.getVisibleCells().map((cell) => (
                  <View key={cell.id} style={{ width: getColWidth(cell.column.id) }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function getColWidth(id: string): number {
  switch (id) {
    case "name": return 240;
    case "stars": return 80;
    case "forks": return 80;
    case "description": return 320;
    default: return 120;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { marginBottom: 4 },
  subtitle: { marginBottom: 16, opacity: 0.6 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 8 },
  headerCell: { paddingHorizontal: 4 },
  headerText: { fontWeight: "700", fontSize: 13 },
  body: { flex: 1 },
  row: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  groupRow: { backgroundColor: "rgba(128,128,128,0.06)" },
  cell: { fontSize: 13, paddingHorizontal: 4 },
  nameCell: { flex: 1 },
  groupName: { fontWeight: "600" },
  numCell: { textAlign: "right" },
  descCell: { opacity: 0.7 },
  expander: { width: 18, fontSize: 10 },
});
