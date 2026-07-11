import { nanoid } from "nanoid/non-secure";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThreeDStore } from "@/store/three-d-store";
import { createEffectInstance } from "@/utils/effect-defaults";
import { stripBoldTags, wrapRichTextWords } from "@/utils/rich-text";
import { ThreeDTextScreen } from "./(tabs)/three-d";
import type { MantraEntry, MantraText } from "@/utils/slides/mcon.data";
import { MANTRAS } from "@/utils/slides/mcon.data";

function normalizeMantraText(mantra: MantraText): string {
  return typeof mantra === "string" ? mantra : mantra.join("\n");
}

function wrapMantraText(text: string, maxChars = 12): string {
  if (text.includes("\n")) return text;
  return wrapRichTextWords(text, maxChars);
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
      name: stripBoldTags(mantraEntries[index]?.[0] ?? "Mantra"),
      text,
      author: mantraEntries[index]?.[1]?.author,
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
