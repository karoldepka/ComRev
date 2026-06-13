<<<<<<< HEAD
import { nanoid } from "nanoid/non-secure";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThreeDStore } from "@/store/three-d-store";
import { createEffectInstance } from "@/utils/effect-defaults";
import { ThreeDTextScreen } from "./(tabs)/three-d";
import { MANTRAS } from "./mcon.data";
import type { MantraEntry, MantraText } from "./mcon.data";

function normalizeMantraText(mantra: MantraText): string {
  return Array.isArray(mantra) ? mantra.join("\n") : mantra;
}

function getMantraSlideText(title: string, entry: MantraEntry): string {
  return entry.text === undefined ? title : normalizeMantraText(entry.text);
}

export default function MconScreen() {
  const setEffectInstances = useThreeDStore((state) => state.setEffectInstances);
  const [didApplyMantras, setDidApplyMantras] = useState(false);
  const { text, textSets } = useMemo(() => {
    const mantraEntries = Object.entries(MANTRAS);
    const slideTexts = mantraEntries.map(([title, entry]) =>
      getMantraSlideText(title, entry),
    );
    const textSets = slideTexts.map((text, index) => ({
      id: `mcon-${nanoid()}`,
      name: mantraEntries[index]?.[0] ?? "Mantra",
      text,
    }));

    return {
      text: slideTexts.join("\n\n"),
      textSets,
    };
  }, []);

  useEffect(() => {
    setEffectInstances((instances) => {
      const mainText = instances.find((instance) => instance.type === "mainText");
      const nextMainText = mainText ?? createEffectInstance("mainText");
      const withoutMainText = instances.filter(
        (instance) => instance.type !== "mainText",
      );

      return [
        {
          ...nextMainText,
          params: {
            ...nextMainText.params,
            text,
            textSets,
            activeTextSetId: textSets[0]?.id,
          },
        },
        ...withoutMainText,
      ];
    });

    setDidApplyMantras(true);
  }, [setEffectInstances, text, textSets]);

  if (didApplyMantras) {
    return <ThreeDTextScreen sequenceMode />;
  }

  return (
    <ThemedView style={styles.screen}>
      <ThemedText>Opening mantra slideshow...</ThemedText>
=======
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";

const MANTRAS = [
  "Put your hardcoded mantras here.",
  "Each string becomes one mantra on /mcon.",
];

export default function MconScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: "MCON" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText type="title">MCON</ThemedText>
          <ThemedText style={styles.subtitle}>
            Hardcoded mantras live in this page file.
          </ThemedText>
        </View>

        <View style={styles.mantraList}>
          {MANTRAS.map((mantra, index) => (
            <View
              key={`${index}-${mantra}`}
              style={[
                styles.mantraCard,
                {
                  backgroundColor: isDark ? "#241f1c" : "#fff7ed",
                  borderColor: isDark ? "#4a3428" : "#fed7aa",
                },
              ]}
            >
              <ThemedText style={styles.mantraText}>{mantra}</ThemedText>
            </View>
          ))}
        </View>
      </ScrollView>
>>>>>>> d28f47a6e94d14d71bd04f50c86a2571887237a4
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
<<<<<<< HEAD
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
=======
    flex: 1,
  },
  content: {
    gap: 24,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  subtitle: {
    opacity: 0.72,
  },
  mantraList: {
    gap: 12,
  },
  mantraCard: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  mantraText: {
    fontSize: 18,
    lineHeight: 28,
>>>>>>> d28f47a6e94d14d71bd04f50c86a2571887237a4
  },
});
