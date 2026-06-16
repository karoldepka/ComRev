import { SlideImage, SlideImageOverlay } from "@/components/SlideImageOverlay";
import { ThreeDText } from "@/components/three-d-text";
import { useConfirmDialog } from "@/components/confirm-dialog";
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
import { createPipeFromInstance } from "@/utils/pipe-factory";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { API_BASE } from '@/utils/api-config';

function effectChips(effects: { type: string; enabled: boolean }[]) {
  return effects.filter((e) => e.enabled && e.type !== "mainText");
}

function presetMainParams(preset: PresetRecord): Record<string, unknown> {
  const mainInst = preset.effects.find((e) => e.type === "mainText");
  return (mainInst?.params ?? {}) as Record<string, unknown>;
}

function presetText(params: Record<string, unknown>): string {
  let text: string;
  if (Array.isArray(params.textSets) && params.textSets.length > 0) {
    const sets = params.textSets as Array<{ id?: string; text?: string }>;
    const activeId = params.activeTextSetId;
    const active = typeof activeId === "string" ? sets.find((s) => s.id === activeId) : null;
    text = String((active ?? sets[0])?.text ?? "");
  } else {
    text = String(params.text ?? "");
  }
  return params.capitalizeText !== false ? text.toUpperCase() : text;
}

function presetImages(params: Record<string, unknown>): SlideImage[] {
  if (Array.isArray(params.textSets) && params.textSets.length > 0) {
    const sets = params.textSets as Array<{ id?: string; images?: SlideImage[] }>;
    const activeId = params.activeTextSetId;
    const active = typeof activeId === "string" ? sets.find((s) => s.id === activeId) : null;
    const imgs = (active ?? sets[0])?.images;
    return Array.isArray(imgs) ? imgs : [];
  }
  return [];
}

function PresetLivePreview({ preset }: { preset: PresetRecord }) {
  const p = presetMainParams(preset);
  const text = presetText(p);
  const images = presetImages(p);

  const pipes = useMemo(
    () => preset.effects.filter((e) => e.enabled).map(createPipeFromInstance),
    [preset.effects],
  );
  return (
    <View style={{ width: "100%", height: 300, borderRadius: 8, overflow: "hidden", position: "relative" }}>
      <ThreeDText
        text={text}
        size={p.size as number | undefined}
        height={p.height as number | undefined}
        color={p.color as number | undefined}
        metalness={p.metalness as number | undefined}
        roughness={p.roughness as number | undefined}
        fontFamily={p.fontFamily as string | undefined}
        bevelEnabled={p.bevelEnabled as boolean | undefined}
        bevelThickness={p.bevelThickness as number | undefined}
        bevelSize={p.bevelSize as number | undefined}
        bevelOffset={p.bevelOffset as number | undefined}
        bevelSegments={p.bevelSegments as number | undefined}
        envMapIntensity={p.envMapIntensity as number | undefined}
        equalizeLineWidths={p.equalizeLineWidths as boolean | undefined}
        equalizationMethod={p.equalizationMethod as "spacing" | "fontSize" | undefined}
        targetWidth={p.targetWidth as number | undefined}
        lineSpacing={p.lineSpacing as number | undefined}
        perspective={p.perspective as number | undefined}
        pipes={pipes}
      />
      <SlideImageOverlay images={images} />
    </View>
  );
}

function ThumbnailZoomOverlay({
  url,
  onDismiss,
}: {
  url: string | null;
  onDismiss: () => void;
}) {
  const { width, height } = useWindowDimensions();

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDismiss]);

  if (!url) return null;

  const imgW = Math.min(width * 0.92, 1400);
  const imgH = Math.min(height * 0.88, imgW * 0.75);

  return (
    <Pressable
      onPress={onDismiss}
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.88)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Pressable onPress={(e) => e.stopPropagation?.()}>
        <Image
          source={{ uri: url }}
          style={{ width: imgW, height: imgH, borderRadius: 10, resizeMode: "contain" }}
        />
      </Pressable>
    </Pressable>
  );
}

export default function PresetsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [livePresetId, setLivePresetId] = useState<string | null>(null);

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
      setPresets(
        loaded.sort((a, b) =>
          b.when_last_modified.localeCompare(a.when_last_modified),
        ),
      );
    } catch {}
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
      try {
        await deletePresetFromBackend(API_BASE, id);
      } catch {}
      setPresets((prev) => prev.filter((p) => p.id !== id));
    };
    const confirmed = await confirm({
      title: "Delete preset",
      message: "Delete this preset?",
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (confirmed) await doDelete();
  };

  const filtered = search.trim()
    ? presets.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : presets;

  const dark = colorScheme === "dark";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Presets</Text>
        <TouchableOpacity
          onPress={loadList}
          style={[styles.refreshBtn, { borderColor: colors.tint }]}
        >
          <Text style={{ color: colors.tint, fontSize: 13 }}>↺ Refresh</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.search, { borderColor: colors.tint, color: colors.text }]}
        placeholder="Search presets..."
        placeholderTextColor={dark ? "#666" : "#999"}
        value={search}
        onChangeText={setSearch}
      />

      {loading && (
        <Text style={{ color: colors.text, opacity: 0.5, textAlign: "center", marginTop: 20 }}>
          Loading...
        </Text>
      )}

      {!loading && filtered.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.text, opacity: 0.5, textAlign: "center" }}>
            No presets yet.{"\n"}Save one from the 3D Text editor.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {filtered.map((preset) => {
          const chips = effectChips(preset.effects);
          return (
            <TouchableOpacity
              key={preset.id}
              onPress={() => handleLoad(preset)}
              style={[
                styles.card,
                {
                  backgroundColor: dark ? "#1f1f1f" : "#fafafa",
                  borderColor: dark ? "#333" : "#ddd",
                },
              ]}
            >
              {/* Live / static toggle */}
              <View style={{ position: "relative" }}>
                {livePresetId === preset.id ? (
                  <PresetLivePreview preset={preset} />
                ) : preset.thumbnail ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setZoomedUrl(preset.thumbnail!);
                    }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: preset.thumbnail }} style={styles.thumbnail} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.chipRow}>
                    {chips.slice(0, 12).map((e, i) => (
                      <View key={i} style={[styles.chip, { backgroundColor: colors.tint + "28" }]}>
                        <Text style={{ color: colors.tint, fontSize: 10 }}>{e.type}</Text>
                      </View>
                    ))}
                    {chips.length > 12 && (
                      <View style={[styles.chip, { backgroundColor: dark ? "#333" : "#eee" }]}>
                        <Text style={{ color: colors.tint, fontSize: 10 }}>+{chips.length - 12}</Text>
                      </View>
                    )}
                    {chips.length === 0 && (
                      <Text style={{ color: "#888", fontSize: 11 }}>No effects</Text>
                    )}
                  </View>
                )}
                {/* Animate toggle button */}
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    setLivePresetId((cur) => (cur === preset.id ? null : preset.id));
                  }}
                  style={[
                    styles.liveBtn,
                    { backgroundColor: livePresetId === preset.id ? colors.tint : "rgba(0,0,0,0.45)" },
                  ]}
                >
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                    {livePresetId === preset.id ? "■ Static" : "▶ Live"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Name + date + actions */}
              <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>
                {preset.name}
              </Text>
              <Text style={styles.cardDate}>
                {new Date(preset.when_last_modified).toLocaleString()}
              </Text>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => handleLoad(preset)}
                  style={[styles.actionBtn, { backgroundColor: colors.tint }]}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                    Load
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleDelete(preset.id);
                  }}
                  style={[styles.actionBtn, styles.deleteBtn]}
                >
                  <Text style={{ color: "#e55", fontSize: 13 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={zoomedUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomedUrl(null)}
        statusBarTranslucent
      >
        <ThumbnailZoomOverlay url={zoomedUrl} onDismiss={() => setZoomedUrl(null)} />
      </Modal>
      {confirmDialog}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "700" },
  refreshBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
  list: { padding: 12, gap: 14 },
  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  thumbnail: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    resizeMode: "cover",
  },
  liveBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, minHeight: 40 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardName: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  cardDate: { fontSize: 11, color: "#888" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  deleteBtn: { borderWidth: 1, borderColor: "#e55" },
});
