import { nanoid } from 'nanoid/non-secure';
import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThreeDStore } from '@/store/three-d-store';
import { savePresetOfflineFirst } from '@/utils/config-store';
import { API_BASE } from '@/utils/api-config';

interface Props {
  defaultName: string;
}

export function DuplicatePresetButton({ defaultName }: Props) {
  const effectInstances = useThreeDStore((s) => s.effectInstances);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current); }, []);

  const showStatus = (msg: string, durationMs: number) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(msg);
    statusTimerRef.current = setTimeout(() => setStatus(null), durationMs);
  };

  const openModal = () => {
    setName(defaultName ? `${defaultName} copy` : 'My preset');
    setShowModal(true);
  };

  const save = async () => {
    const finalName = name.trim() || defaultName;
    setShowModal(false);
    const now = new Date().toISOString();
    try {
      await savePresetOfflineFirst(
        { id: nanoid(), name: finalName, when_created: now, when_last_modified: now, effects: effectInstances },
        API_BASE,
      );
      showStatus(`Saved "${finalName}"`, 2500);
    } catch (e) {
      console.error('Failed to duplicate preset', e);
      showStatus('Save failed', 3000);
    }
  };

  return (
    <>
      <View style={styles.fab}>
        {status ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.button} onPress={openModal}>
            <Text style={styles.buttonText}>⧉ Duplicate</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Save as preset</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoFocus
              selectTextOnFocus
              placeholder="Preset name"
              placeholderTextColor="#888"
              onSubmitEditing={save}
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancel} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirm} onPress={save}>
                <Text style={styles.confirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 100,
  },
  button: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: { color: '#7f7', fontSize: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: 280,
    gap: 14,
  },
  dialogTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 10 },
  cancel: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelText: { color: '#ccc' },
  confirm: {
    flex: 1,
    padding: 10,
    backgroundColor: '#ff6600',
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '600' },
});
