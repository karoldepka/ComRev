import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  deletePreset,
  deletePresetFromBackend,
  getPresets,
  loadPresetsFromBackend,
  PresetRecord,
  savePreset,
  setPendingPresetToLoad,
} from "@/utils/config-store";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

const API_BASE = "http://localhost:8000";

function effectChips(effects: { type: string; enabled: boolean }[]) {
  return effects.filter(e => e.enabled && e.type !== 'mainText');
}

export default function PresetsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      let loaded: PresetRecord[] = [];
      try {
        loaded = await loadPresetsFromBackend(API_BASE);
        for (const p of loaded) await savePreset(p);
      } catch {
        loaded = await getPresets();
      }
      setPresets(loaded.sort((a, b) => b.when_last_modified.localeCompare(a.when_last_modified)));
    } catch { }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadList(); }, [loadList]));

  const handleLoad = (preset: PresetRecord) => {
    setPendingPresetToLoad(preset);
    router.push("/(tabs)/three-d");
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      await deletePreset(id);
      try { await deletePresetFromBackend(API_BASE, id); } catch { }
      setPresets(prev => prev.filter(p => p.id !== id));
    };
    if (typeof window !== "undefined" && window.confirm) {
      if (window.confirm("Delete this preset?")) doDelete();
    } else {
      Alert.alert("Delete preset", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const filtered = search.trim()
    ? presets.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : presets;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Presets</Text>
        <TouchableOpacity onPress={loadList} style={[styles.refreshBtn, { borderColor: colors.tint }]}>
          <Text style={{ color: colors.tint, fontSize: 13 }}>↺ Refresh</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.search, { borderColor: colors.tint, color: colors.text }]}
        placeholder="Search presets..."
        placeholderTextColor={colorScheme === "dark" ? "#666" : "#999"}
        value={search}
        onChangeText={setSearch}
      />

      {loading && (
        <Text style={{ color: colors.text, opacity: 0.5, textAlign: "center", marginTop: 20 }}>Loading...</Text>
      )}

      {!loading && filtered.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.text, opacity: 0.5, textAlign: "center" }}>
            No presets yet.{"\n"}Save one from the 3D Text editor.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {filtered.map((preset) => {
          const chips = effectChips(preset.effects);
          return (
            <View
              key={preset.id}
              style={[
                styles.card,
                { backgroundColor: colorScheme === "dark" ? "#1f1f1f" : "#fafafa", borderColor: colors.tint },
              ]}
            >
              {/* Name + date */}
              <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>{preset.name}</Text>
              <Text style={styles.cardDate}>{new Date(preset.when_last_modified).toLocaleString()}</Text>

              {/* Effect chips */}
              <View style={styles.chipRow}>
                {chips.slice(0, 8).map((e, i) => (
                  <View key={i} style={[styles.chip, { backgroundColor: colorScheme === "dark" ? "#333" : "#eee" }]}>
                    <Text style={{ color: colors.text, fontSize: 10 }}>{e.type}</Text>
                  </View>
                ))}
                {chips.length > 8 && (
                  <View style={[styles.chip, { backgroundColor: colorScheme === "dark" ? "#333" : "#eee" }]}>
                    <Text style={{ color: colors.tint, fontSize: 10 }}>+{chips.length - 8}</Text>
                  </View>
                )}
                {chips.length === 0 && (
                  <Text style={{ color: "#888", fontSize: 11 }}>No effects</Text>
                )}
              </View>

              {/* Actions */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => handleLoad(preset)}
                  style={[styles.actionBtn, { backgroundColor: colors.tint }]}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Load</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(preset.id)}
                  style={[styles.actionBtn, styles.deleteBtn]}
                >
                  <Text style={{ color: "#e55", fontSize: 13 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  refreshBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  search: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 12 },
  card: { width: "47%", borderWidth: 1, borderRadius: 10, padding: 12, gap: 6, minWidth: 160 },
  cardName: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  cardDate: { fontSize: 10, color: "#888" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardActions: { flexDirection: "row", gap: 6, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  deleteBtn: { borderWidth: 1, borderColor: "#e55" },
});
