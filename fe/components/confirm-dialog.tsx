import { useAppTheme } from '@/components/app-theme-provider';
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  hideCancel?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmDialog() {
  const { colorScheme, colors } = useAppTheme();
  const dark = colorScheme === "dark";
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = React.useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending],
  );

  const dialog = (
    <Modal
      visible={pending !== null}
      transparent
      animationType="fade"
      onRequestClose={() => close(false)}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => close(false)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss confirmation dialog"
      >
        <Pressable
          style={[
            styles.box,
            { backgroundColor: dark ? "#1e1e1e" : "#fff" },
          ]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            {pending?.title}
          </Text>
          <Text style={[styles.message, { color: dark ? "#aaa" : "#555" }]}>
            {pending?.message}
          </Text>
          <View style={[styles.buttonRow, { borderTopColor: dark ? "#333" : "#eee" }]}>
            {!pending?.hideCancel && (
              <Pressable
                style={[styles.btn, { borderRightWidth: 1, borderRightColor: dark ? "#333" : "#eee" }]}
                onPress={() => close(false)}
                accessibilityRole="button"
                accessibilityLabel={pending?.cancelText ?? "Cancel"}
              >
                <Text style={[styles.btnText, { color: colors.tint }]}>
                  {pending?.cancelText ?? "Cancel"}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={styles.btn}
              onPress={() => close(true)}
              accessibilityRole="button"
              accessibilityLabel={pending?.confirmText ?? "OK"}
            >
              <Text
                style={[
                  styles.btnText,
                  styles.btnBold,
                  { color: pending?.destructive ? "#d33" : colors.tint },
                ]}
              >
                {pending?.confirmText ?? "OK"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { confirm, dialog };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    width: 300,
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 16,
  },
  btnBold: {
    fontWeight: "600",
  },
});
