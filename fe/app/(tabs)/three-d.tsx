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
    Text,
    TouchableOpacity,
    Switch,
} from "react-native";

export default function ThreeDTextScreen() {
  const [text, setText] = useState("Hi\nHello World\nThis is a very long line of text");
  const [equalizeLineWidths, setEqualizeLineWidths] = useState(false);
  const [equalizationMethod, setEqualizationMethod] = useState<'spacing' | 'fontSize'>('fontSize');
  const [targetWidth, setTargetWidth] = useState(20);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <View style={styles.canvas}>
          <ThreeDText
            text={text}
            equalizeLineWidths={equalizeLineWidths}
            equalizationMethod={equalizationMethod}
            targetWidth={targetWidth}
            lineSpacing={lineSpacing}
          />
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
            placeholder="Enter multi-line text for 3D rendering"
            placeholderTextColor={colorScheme === "dark" ? "#999" : "#ccc"}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={4}
          />

          <View style={styles.controlRow}>
            <Text style={[styles.label, { color: colors.text }]}>
              Equalize Line Widths
            </Text>
            <Switch
              value={equalizeLineWidths}
              onValueChange={setEqualizeLineWidths}
              trackColor={{ false: '#767577', true: colors.tint }}
              thumbColor={equalizeLineWidths ? colors.tint : '#f4f3f4'}
            />
          </View>

          {equalizeLineWidths && (
            <>
              <View style={styles.controlRow}>
                <Text style={[styles.label, { color: colors.text }]}>
                  Method: {equalizationMethod === 'spacing' ? 'Spacing' : 'Font Size'}
                </Text>
                <TouchableOpacity
                  style={[styles.methodButton, { borderColor: colors.tint }]}
                  onPress={() => setEqualizationMethod(
                    equalizationMethod === 'spacing' ? 'fontSize' : 'spacing'
                  )}
                >
                  <Text style={[styles.buttonText, { color: colors.tint }]}>
                    Switch to {equalizationMethod === 'spacing' ? 'Font Size' : 'Spacing'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sliderRow}>
                <Text style={[styles.label, { color: colors.text }]}>
                  Target Width: {targetWidth.toFixed(1)}
                </Text>
                <input
                  type="range"
                  min="5"
                  max="40"
                  step="0.1"
                  value={targetWidth}
                  onChange={(e: any) => setTargetWidth(parseFloat(e.target.value))}
                  style={{ flex: 1, marginLeft: 12 }}
                />
              </View>
            </>
          )}

          <View style={styles.sliderRow}>
            <Text style={[styles.label, { color: colors.text }]}>
              Line Spacing: {lineSpacing.toFixed(1)}
            </Text>
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.01"
              value={lineSpacing}
              onChange={(e: any) => setLineSpacing(parseFloat(e.target.value))}
              style={{ flex: 1, marginLeft: 12 }}
            />
          </View>
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
    marginBottom: 16,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  methodButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  widthControls: {
    flexDirection: 'row',
    gap: 8,
  },
  widthButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: 'center',
  },
});
