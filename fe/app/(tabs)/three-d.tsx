import { ThreeDText } from "@/components/three-d-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import React, { useState } from "react";
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";

export default function ThreeDTextScreen() {
  const [text, setText] = useState("3D Text");
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <View style={styles.canvas}>
          <ThreeDText text={text} />
        </View>

        <ScrollView style={styles.inputContainer}>
          <TextInput
            style={[
              styles.textInput,
              {
                color: colors.text,
                borderColor: colors.tint,
                backgroundColor: colorScheme === "dark" ? "#2a2a2a" : "#f5f5f5",
              },
            ]}
            placeholder="Enter text for 3D rendering"
            placeholderTextColor={colorScheme === "dark" ? "#999" : "#ccc"}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={4}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    flexDirection: "column",
  },
  canvas: {
    flex: 2,
    width: "100%",
  },
  inputContainer: {
    flex: 1,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
  },
});
