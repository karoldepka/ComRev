import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import {
  AiMessage,
  AiProvider,
  callAiEffectApi,
  extractCode,
  getStoredApiKey,
  getStoredModel,
  getStoredOllamaModel,
  getStoredOllamaUrl,
  getStoredProvider,
  setStoredApiKey,
  setStoredModel,
  setStoredOllamaModel,
  setStoredOllamaUrl,
  setStoredProvider,
} from '@/utils/ai-effect-api';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called when user applies a generated/edited effect. */
  onApplyEffect: (code: string, description: string) => void;
  /** Pass existing code when refining an effect. */
  initialCode?: string;
  /** Pass existing description when refining an effect. */
  initialDescription?: string;
}

export function AiEffectChatModal({
  visible,
  onClose,
  onApplyEffect,
  initialCode,
  initialDescription,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const c = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [provider, setProviderState] = useState<AiProvider>(() => getStoredProvider());
  const [apiKey, setApiKeyState] = useState(() => getStoredApiKey());
  const [model, setModelState] = useState(() => getStoredModel());
  const [ollamaUrl, setOllamaUrlState] = useState(() => getStoredOllamaUrl());
  const [ollamaModel, setOllamaModelState] = useState(() => getStoredOllamaModel());
  const [showSettings, setShowSettings] = useState(() => provider === 'anthropic' && !getStoredApiKey());

  // Editable code block — starts from initialCode or last AI-generated code
  const [editableCode, setEditableCode] = useState(initialCode ?? '');
  const [codeDescription, setCodeDescription] = useState(initialDescription ?? '');

  const scrollRef = useRef<ScrollView>(null);

  const handleSaveSettings = () => {
    setStoredProvider(provider);
    setStoredApiKey(apiKey);
    setStoredModel(model);
    setStoredOllamaUrl(ollamaUrl);
    setStoredOllamaModel(ollamaModel);
    setShowSettings(false);
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (provider === 'anthropic' && !apiKey) { setShowSettings(true); setError('Please enter your Anthropic API key first.'); return; }

    const userMsg: AiMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const raw = await callAiEffectApi(
        nextMessages, apiKey,
        provider === 'ollama' ? ollamaModel : model,
        provider === 'ollama' ? ollamaUrl : 'https://api.anthropic.com',
        provider,
      );
      const code = extractCode(raw);
      const assistantMsg: AiMessage = { role: 'assistant', content: raw };
      setMessages([...nextMessages, assistantMsg]);
      if (code) {
        setEditableCode(code);
        if (!codeDescription) setCodeDescription(text);
      }
    } catch (e) {
      setError(String(e));
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${e}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, apiKey, model, ollamaUrl, ollamaModel, provider, messages, codeDescription]);

  const handleApply = () => {
    if (!editableCode.trim()) return;
    onApplyEffect(editableCode.trim(), codeDescription || 'AI custom effect');
    onClose();
  };

  const bg = isDark ? '#1a1a1a' : '#fff';
  const cardBg = isDark ? '#252525' : '#f5f5f5';
  const border = isDark ? '#333' : '#ddd';
  const codeBg = isDark ? '#0d1117' : '#f0f0f0';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <Text style={[styles.title, { color: c.text }]}>AI Effect Generator</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={{ color: c.text, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Settings panel */}
          <View style={[styles.settingsBar, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => setShowSettings((v) => !v)} style={styles.settingsToggle}>
              <Text style={{ color: c.tint, fontSize: 13 }}>
                {showSettings ? '▲' : '▼'} AI Settings
                {' — '}{provider === 'ollama' ? `Ollama (${ollamaModel})` : `Anthropic${apiKey ? ' ✓' : ' (required)'}`}
              </Text>
            </TouchableOpacity>
            {showSettings && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                {/* Provider toggle */}
                <Text style={[styles.label, { color: c.text }]}>Provider</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  {(['anthropic', 'ollama'] as AiProvider[]).map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setProviderState(p)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
                        borderColor: provider === p ? c.tint : border,
                        backgroundColor: provider === p ? c.tint + '22' : 'transparent' }}
                    >
                      <Text style={{ color: provider === p ? c.tint : c.text, fontSize: 13, fontWeight: '600' }}>
                        {p === 'anthropic' ? 'Anthropic' : 'Ollama (local)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {provider === 'anthropic' ? (
                  <>
                    <Text style={[styles.label, { color: c.text }]}>Anthropic API Key</Text>
                    <TextInput style={[styles.apiInput, { color: c.text, borderColor: border, backgroundColor: cardBg }]}
                      value={apiKey} onChangeText={setApiKeyState} placeholder="sk-ant-..."
                      placeholderTextColor="#888" secureTextEntry autoCapitalize="none" autoCorrect={false} />
                    <Text style={[styles.label, { color: c.text, marginTop: 6 }]}>Model</Text>
                    <TextInput style={[styles.apiInput, { color: c.text, borderColor: border, backgroundColor: cardBg }]}
                      value={model} onChangeText={setModelState} placeholder="claude-sonnet-4-6"
                      placeholderTextColor="#888" autoCapitalize="none" autoCorrect={false} />
                  </>
                ) : (
                  <>
                    <Text style={[styles.label, { color: c.text }]}>Ollama URL</Text>
                    <TextInput style={[styles.apiInput, { color: c.text, borderColor: border, backgroundColor: cardBg }]}
                      value={ollamaUrl} onChangeText={setOllamaUrlState} placeholder="http://localhost:11434"
                      placeholderTextColor="#888" autoCapitalize="none" autoCorrect={false} />
                    <Text style={[styles.label, { color: c.text, marginTop: 6 }]}>Model</Text>
                    <TextInput style={[styles.apiInput, { color: c.text, borderColor: border, backgroundColor: cardBg }]}
                      value={ollamaModel} onChangeText={setOllamaModelState} placeholder="qwen2.5-coder:7b"
                      placeholderTextColor="#888" autoCapitalize="none" autoCorrect={false} />
                    <Text style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                      Ollama must be running locally. Run: ollama serve
                    </Text>
                  </>
                )}

                <TouchableOpacity onPress={handleSaveSettings} style={[styles.saveBtn, { backgroundColor: c.tint }]}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={{ paddingVertical: 8 }}
          >
            {messages.length === 0 && (
              <Text style={[styles.hint, { color: isDark ? '#888' : '#aaa' }]}>
                Describe the effect you want — e.g. "make the text gently float up and down" or "add a neon glow that pulses".
                {initialCode ? '\n\nExisting code is loaded below. Ask for refinements.' : ''}
              </Text>
            )}
            {messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? [styles.userBubble, { backgroundColor: c.tint }]
                    : [styles.aiBubble, { backgroundColor: cardBg, borderColor: border }],
                ]}
              >
                <Text
                  style={{
                    color: m.role === 'user' ? ('#fff') : c.text,
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  {m.role === 'assistant' && extractCode(m.content)
                    ? '[Code generated — see editor below]'
                    : m.content}
                </Text>
              </View>
            ))}
            {loading && (
              <View style={[styles.aiBubble, styles.bubble, { backgroundColor: cardBg, borderColor: border }]}>
                <ActivityIndicator size="small" color={c.tint} />
              </View>
            )}
            {error ? (
              <Text style={[styles.errorText, { color: '#e55' }]}>{error}</Text>
            ) : null}
          </ScrollView>

          {/* Code editor */}
          {(editableCode || initialCode) ? (
            <View style={[styles.codeSection, { borderTopColor: border, borderBottomColor: border }]}>
              <View style={styles.codeHeader}>
                <Text style={[styles.label, { color: c.text }]}>Generated code (editable)</Text>
                <TouchableOpacity
                  onPress={handleApply}
                  style={[styles.applyBtn, { backgroundColor: c.tint }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                    Apply Effect
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal style={{ flex: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
                <TextInput
                  style={[styles.codeInput, { color: isDark ? '#e8e8e8' : '#222', backgroundColor: codeBg }]}
                  value={editableCode}
                  onChangeText={setEditableCode}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                />
              </ScrollView>
            </View>
          ) : null}

          {/* Input bar */}
          <View style={[styles.inputBar, { borderTopColor: border, backgroundColor: bg }]}>
            <TextInput
              style={[styles.chatInput, { color: c.text, borderColor: border, backgroundColor: cardBg }]}
              value={input}
              onChangeText={setInput}
              placeholder="Describe the effect..."
              placeholderTextColor="#888"
              onSubmitEditing={send}
              returnKeyType="send"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={send}
              disabled={loading || !input.trim()}
              style={[styles.sendBtn, { backgroundColor: c.tint, opacity: loading || !input.trim() ? 0.5 : 1 }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '700' },
  closeBtn: { padding: 4 },
  settingsBar: { borderBottomWidth: 1 },
  settingsToggle: { paddingHorizontal: 12, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  apiInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  saveBtn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  messages: { maxHeight: 220, paddingHorizontal: 12 },
  hint: { fontSize: 13, lineHeight: 19, marginHorizontal: 4, marginVertical: 8 },
  bubble: {
    marginVertical: 3,
    padding: 10,
    borderRadius: 10,
    maxWidth: '85%',
  },
  userBubble: { alignSelf: 'flex-end' },
  aiBubble: { alignSelf: 'flex-start', borderWidth: 1 },
  errorText: { fontSize: 12, marginVertical: 4, marginHorizontal: 4 },
  codeSection: { borderTopWidth: 1, borderBottomWidth: 1, maxHeight: 220 },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  codeInput: {
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 10,
    minWidth: 300,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
});
