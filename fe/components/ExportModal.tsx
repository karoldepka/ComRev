import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';

// ── Format definitions ────────────────────────────────────────────────────────

type FormatCategory = 'image' | 'merchandise' | '3d';

interface ExportFormat {
  id: string;
  label: string;
  description: string;
  isPremium: boolean;
  category: FormatCategory;
}

const EXPORT_FORMATS: ExportFormat[] = [
  // Image
  { id: 'png',       label: 'PNG Screenshot',    description: 'Current view as PNG image',       isPremium: false, category: 'image' },
  { id: 'svg',       label: 'SVG Vector',         description: 'Scalable vector graphics',        isPremium: true,  category: 'image' },
  // Merchandise
  { id: 'mousepad',  label: 'Mouse Pad',          description: 'Print-ready 220×180mm artwork',   isPremium: true,  category: 'merchandise' },
  { id: 'towel',     label: 'Towel',              description: 'Print-ready towel artwork',        isPremium: true,  category: 'merchandise' },
  { id: 'shirt',     label: 'T-Shirt',            description: 'Print-ready shirt front design',  isPremium: true,  category: 'merchandise' },
  { id: 'hoodie',    label: 'Hoodie',             description: 'Print-ready hoodie design',        isPremium: true,  category: 'merchandise' },
  // 3D models
  { id: 'stl',       label: '3D Model (.STL)',    description: 'For FDM/SLA 3D printing',         isPremium: true,  category: '3d' },
  { id: 'obj',       label: '3D Model (.OBJ)',    description: 'Standard 3D model format',        isPremium: true,  category: '3d' },
  { id: 'gltf',      label: '3D Model (.glTF)',   description: 'Web-ready 3D format',             isPremium: true,  category: '3d' },
  { id: 'ply',       label: '3D Model (.PLY)',    description: 'Point cloud / mesh format',       isPremium: true,  category: '3d' },
];

const CATEGORY_LABELS: Record<FormatCategory, string> = {
  image: 'Image',
  merchandise: 'Merchandise',
  '3d': '3D Models',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  captureFrame: () => Promise<string | null>;
  getMesh: () => THREE.Mesh | THREE.Group | null;
  getScene: () => THREE.Scene | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(text: string, filename: string, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExportModal({ visible, onClose, captureFrame, getMesh, getScene }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const c = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const [selected, setSelected] = useState<Set<string>>(new Set(['png']));
  const [exporting, setExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const bg = isDark ? '#1a1a1a' : '#fff';
  const cardBg = isDark ? '#252525' : '#f5f5f5';
  const border = isDark ? '#333' : '#ddd';
  const premiumColor = '#f59e0b'; // amber for premium badge

  const toggleFormat = (id: string, isPremium: boolean) => {
    if (isPremium) return; // premium formats are not togglable (just show upgrade prompt)
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0) { setStatusMsg('Select at least one format.'); return; }
    setExporting(true);
    setStatusMsg('');

    try {
      for (const id of selected) {
        setStatusMsg(`Exporting ${id.toUpperCase()}…`);
        if (id === 'png') {
          const dataUrl = await captureFrame();
          if (dataUrl) {
            downloadDataUrl(dataUrl, 'comrev-3d.png');
          } else {
            setStatusMsg('PNG capture failed — try again.');
            setExporting(false);
            return;
          }
        } else if (id === 'stl') {
          const mesh = getMesh();
          if (!mesh) { setStatusMsg('No mesh available.'); continue; }
          const exporter = new STLExporter();
          const stlBuffer = exporter.parse(mesh, { binary: true });
          downloadBlob(new Blob([stlBuffer], { type: 'model/stl' }), 'comrev-3d.stl');
        } else if (id === 'obj') {
          const mesh = getMesh();
          if (!mesh) { setStatusMsg('No mesh available.'); continue; }
          const exporter = new OBJExporter();
          const objText = exporter.parse(mesh);
          downloadText(objText, 'comrev-3d.obj', 'model/obj');
        } else if (id === 'gltf') {
          const mesh = getMesh();
          if (!mesh) { setStatusMsg('No mesh available.'); continue; }
          await new Promise<void>((resolve, reject) => {
            const exporter = new GLTFExporter();
            exporter.parse(mesh, (result) => {
              const json = JSON.stringify(result, null, 2);
              downloadText(json, 'comrev-3d.gltf', 'model/gltf+json');
              resolve();
            }, reject, { binary: false });
          });
        } else if (id === 'ply') {
          const mesh = getMesh();
          if (!mesh) { setStatusMsg('No mesh available.'); continue; }
          const exporter = new PLYExporter();
          exporter.parse(mesh, (result: any) => {
            downloadBlob(new Blob([result], { type: 'application/octet-stream' }), 'comrev-3d.ply');
          }, { binary: true } as any);
        }
      }
      setStatusMsg(`Done! ${selected.size} file(s) downloaded.`);
    } catch (e) {
      setStatusMsg(`Export failed: ${String(e).slice(0, 120)}`);
    } finally {
      setExporting(false);
    }
  };

  const categories = (['image', 'merchandise', '3d'] as FormatCategory[]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <Text style={[styles.title, { color: c.text }]}>Export</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={{ color: c.text, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {categories.map((cat) => (
              <View key={cat} style={{ marginTop: 16 }}>
                <Text style={[styles.catLabel, { color: c.text, opacity: 0.55 }]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
                {EXPORT_FORMATS.filter((f) => f.category === cat).map((fmt) => {
                  const isSelected = selected.has(fmt.id);
                  return (
                    <TouchableOpacity
                      key={fmt.id}
                      onPress={() => toggleFormat(fmt.id, fmt.isPremium)}
                      style={[
                        styles.formatRow,
                        {
                          backgroundColor: isSelected ? `${c.tint}18` : cardBg,
                          borderColor: isSelected ? c.tint : border,
                        },
                      ]}
                      activeOpacity={fmt.isPremium ? 1 : 0.7}
                    >
                      {/* Checkbox / Lock */}
                      <View style={[styles.checkbox, {
                        borderColor: fmt.isPremium ? premiumColor : c.tint,
                        backgroundColor: isSelected ? c.tint : 'transparent',
                      }]}>
                        {fmt.isPremium
                          ? <Text style={{ fontSize: 10, color: premiumColor }}>P</Text>
                          : isSelected
                            ? <Text style={{ fontSize: 11, color: isDark ? '#000' : '#fff' }}>✓</Text>
                            : null
                        }
                      </View>

                      {/* Labels */}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                            {fmt.label}
                          </Text>
                          {fmt.isPremium && (
                            <View style={[styles.premiumBadge, { borderColor: premiumColor }]}>
                              <Text style={{ color: premiumColor, fontSize: 9, fontWeight: '700' }}>PRO</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ color: isDark ? '#888' : '#999', fontSize: 12 }}>
                          {fmt.description}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Premium CTA */}
            <View style={[styles.premiumCta, { backgroundColor: `${premiumColor}18`, borderColor: premiumColor }]}>
              <Text style={{ color: premiumColor, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                Unlock PRO
              </Text>
              <Text style={{ color: isDark ? '#ccc' : '#555', fontSize: 12 }}>
                Get merchandise exports, 3D print files, and more.
              </Text>
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: premiumColor }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Get Premium</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: border, backgroundColor: bg }]}>
            {statusMsg ? (
              <Text style={{ color: c.text, fontSize: 12, marginBottom: 6 }} numberOfLines={1}>
                {statusMsg}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={handleExport}
              disabled={exporting || selected.size === 0}
              style={[
                styles.exportBtn,
                { backgroundColor: c.tint, opacity: exporting || selected.size === 0 ? 0.5 : 1 },
              ]}
            >
              {exporting
                ? <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
                : <Text style={{ color: isDark ? '#000' : '#fff', fontWeight: '700', fontSize: 15 }}>
                    Export ({selected.size})
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '85%',
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
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 4 },
  catLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 6,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 3,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  premiumCta: {
    marginHorizontal: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  upgradeBtn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
  },
  exportBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
