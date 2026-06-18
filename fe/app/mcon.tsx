import { nanoid } from "nanoid/non-secure";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThreeDStore } from "@/store/three-d-store";
import { createEffectInstance } from "@/utils/effect-defaults";
import { ThreeDTextScreen } from "./(tabs)/three-d";
import type { MantraEntry, MantraText } from "@/utils/slides/mcon.data";
import { MANTRAS } from "@/utils/slides/mcon.data";

function normalizeMantraText(mantra: MantraText): string {
  return Array.isArray(mantra) ? mantra.join("\n") : mantra;
}

const stripBoldTagsForWrap = (s: string) => s.replace(/<\/?b>/gi, '');

function wrapMantraText(text: string, maxChars = 12): string {
  if (text.includes("\n")) return text;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const visCurrentLen = stripBoldTagsForWrap(current).length;
    const visWordLen = stripBoldTagsForWrap(word).length;
    if (!current) {
      current = word;
    } else if (visCurrentLen + 1 + visWordLen <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function getMantraSlideText(title: string, entry: MantraEntry): string {
  const raw =
    entry.text === undefined ? title : normalizeMantraText(entry.text);
  return wrapMantraText(raw);
}

export default function MconScreen() {
  const setEffectInstances = useThreeDStore(
    (state) => state.setEffectInstances,
  );
  const setMantraMode = useThreeDStore((state) => state.setMantraMode);
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
    setMantraMode(true);
    setEffectInstances((instances) => {
      const mainText = instances.find((i) => i.type === "mainText");
      const nextMainText = mainText ?? createEffectInstance("mainText");
      const withoutMainText = instances.filter((i) => i.type !== "mainText");
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
    return () => setMantraMode(false);
  }, [setEffectInstances, setMantraMode, text, textSets]);

  if (didApplyMantras) {
    return <ThreeDTextScreen sequenceMode skipSavedConfigLoad />;
  }

  return (
    <ThemedView style={styles.screen}>
      <ThemedText>Opening mantra slideshow...</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
});
