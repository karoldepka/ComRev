import React, {
  type ErrorInfo,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '@/components/app-theme-provider';

type ErrorAlertProps = PropsWithChildren;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function reportUnexpectedError(error: Error, context: string) {
  console.error(`Unexpected application error (${context}):`, error);
}

class RenderErrorBoundary extends React.Component<
  PropsWithChildren<{ onError: (error: Error) => void }>,
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      'Unexpected application render error:',
      error,
      info.componentStack,
    );
    this.props.onError(error);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.fallback, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        Something unexpected happened.
      </Text>
      <Text style={[styles.message, { color: colors.icon }]}>
        {error.message}
      </Text>
      <Pressable
        onPress={onRetry}
        style={[styles.primaryButton, { backgroundColor: colors.tint }]}
      >
        <Text style={[styles.primaryButtonText, { color: colors.onTint }]}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

function ErrorAlertContents({ children }: ErrorAlertProps) {
  const { colors } = useAppTheme();
  const [error, setError] = useState<Error | null>(null);
  const report = useCallback((nextError: Error, context: string) => {
    reportUnexpectedError(nextError, context);
    setError(nextError);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onError = (event: ErrorEvent) => {
      report(
        event.error ? toError(event.error) : new Error(event.message),
        'window error',
      );
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      report(toError(event.reason), 'unhandled promise rejection');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [report]);

  const reload = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    setError(null);
  }, []);

  return (
    <>
      <RenderErrorBoundary onError={(nextError) => report(nextError, 'render')}>
        {children}
      </RenderErrorBoundary>
      <Modal
        visible={error !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setError(null)}
      >
        <View style={styles.backdrop}>
          <View
            style={[
              styles.alert,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              Something unexpected happened.
            </Text>
            <Text
              style={[styles.message, { color: colors.icon }]}
              numberOfLines={4}
            >
              {error?.message || 'The app encountered an unknown error.'}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={() => setError(null)}
                style={[styles.secondaryButton, { borderColor: colors.border }]}
              >
                <Text
                  style={[styles.secondaryButtonText, { color: colors.text }]}
                >
                  Dismiss
                </Text>
              </Pressable>
              <Pressable
                onPress={reload}
                style={[styles.primaryButton, { backgroundColor: colors.tint }]}
              >
                <Text
                  style={[styles.primaryButtonText, { color: colors.onTint }]}
                >
                  {Platform.OS === 'web' ? 'Reload app' : 'Try again'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function ErrorAlert({ children }: ErrorAlertProps) {
  return <ErrorAlertContents>{children}</ErrorAlertContents>;
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  alert: {
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 440,
    padding: 20,
    width: '88%',
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'center',
  },
  fallback: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  message: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  primaryButtonText: { fontSize: 14, fontWeight: '800' },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  title: { fontSize: 19, fontWeight: '800', lineHeight: 25 },
});
