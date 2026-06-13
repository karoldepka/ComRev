import { nanoid } from "nanoid/non-secure";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThreeDStore } from "@/store/three-d-store";
import { createEffectInstance } from "@/utils/effect-defaults";
import type { MantraEntry, MantraText } from "./mcon.data";
import { MANTRAS } from "./mcon.data";
import { ThreeDTextScreen } from "./(tabs)/three-d";

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
