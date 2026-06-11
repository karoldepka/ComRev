import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import {
  ColorScheme, FireState, FireworksState, FractalParams, FractalType,
  fetchIconSvg, generateAiImage, IconResult, PlasmaParams,
  PRESET_SCHEMES, SCHEME_NAMES, renderFractal, renderPlasma, searchIcons,
} from '@/utils/image-sources';

export interface ImagePickerResult { dataUrl: string; type: 'image' | 'svg'; }

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: ImagePickerResult) => void;
  tint: string;
  textColor: string;
  background: string;
  borderColor: string;
}

type Tab = 'file' | 'generate' | 'ai' | 'icons';
type GenerateMode = 'mandelbrot' | 'julia' | 'burningShip' | 'tricorn' | 'plasma' | 'fire' | 'fireworks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'file',     label: '📁 Files'    },
  { id: 'generate', label: '🎨 Generate' },
  { id: 'ai',       label: '✨ AI'       },
  { id: 'icons',    label: '🔍 Icons'   },
];
const FRACTAL_MODES: GenerateMode[] = ['mandelbrot', 'julia', 'burningShip', 'tricorn'];
const GEN_MODES: GenerateMode[] = [...FRACTAL_MODES, 'plasma', 'fire', 'fireworks'];
const ANIMATED_MODES: GenerateMode[] = ['plasma', 'fire', 'fireworks'];

const PREVIEW_SIZE = 256;

const DEFAULT_FRACTAL: FractalParams = {
  type: 'mandelbrot', scheme: 'psychedelic', maxIter: 128,
  zoom: 0.35, cx: -0.5, cy: 0, juliaRe: -0.7, juliaIm: 0.27, size: 512,
};
const DEFAULT_PLASMA: PlasmaParams = { scale: 8, scheme: 'psychedelic' };

// ── Scheme picker sub-component ───────────────────────────────────────────────
function SchemePicker({ value, onChange, tint, textColor }: {
  value: string; onChange: (s: string) => void; tint: string; textColor: string;
}) {
  return (
    <View>
      <Text style={{ color: textColor, fontSize: 11, marginBottom: 4, opacity: 0.7 }}>Color Scheme</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SCHEME_NAMES.map(name => {
            const stops = PRESET_SCHEMES[name];
            const isActive = value === name;
            return (
              <TouchableOpacity key={name} onPress={() => onChange(name)}
                style={{ alignItems: 'center', gap: 3 }}>
                {/* Gradient swatch */}
                <View style={{ width: 40, height: 18, borderRadius: 4, overflow: 'hidden', borderWidth: isActive ? 2 : 1, borderColor: isActive ? tint : '#666' }}>
                  <View style={{ flexDirection: 'row', flex: 1 }}>
                    {stops.map((stop, i) => (
                      <View key={i} style={{ flex: 1, backgroundColor: `rgb(${stop.r},${stop.g},${stop.b})` }} />
                    ))}
                  </View>
                </View>
                <Text style={{ color: isActive ? tint : textColor, fontSize: 9 }}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function ImagePickerModal({ visible, onClose, onSelect, tint, textColor, background, borderColor }: Props) {
  const [tab, setTab] = useState<Tab>('file');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staticPreview, setStaticPreview] = useState<string | null>(null);

  // Generate tab
  const [genMode, setGenMode] = useState<GenerateMode>('plasma');
  const [animated, setAnimated] = useState(true);
  const [fractalParams, setFractalParams] = useState<FractalParams>(DEFAULT_FRACTAL);
  const [plasmaParams, setPlasmaParams] = useState<PlasmaParams>(DEFAULT_PLASMA);
  const [fireScheme, setFireScheme] = useState('fire');
  const [fwScheme, setFwScheme] = useState('neon');
  const [fwTrail, setFwTrail] = useState(0.15);
  const [fwCount, setFwCount] = useState(120);

  // Animation state refs (not in React state to avoid re-renders)
  const offscreenCanvas = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const animRaf = useRef<number>(0);
  const timeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const fireStateRef = useRef<FireState | null>(null);
  const fwStateRef = useRef<FireworksState | null>(null);

  // AI tab
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSeed, setAiSeed] = useState(() => Math.floor(Math.random() * 9999));

  // Icons tab
  const [iconQuery, setIconQuery] = useState('');
  const [iconResults, setIconResults] = useState<IconResult[]>([]);
  const [iconSearched, setIconSearched] = useState(false);

  const c = { tint, text: textColor, bg: background, border: borderColor };
  const setErr = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const accept = (dataUrl: string, type: 'image' | 'svg' = 'image') => {
    onSelect({ dataUrl, type });
    onClose();
  };

  // ── Off-screen canvas setup ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PREVIEW_SIZE;
    offscreenCanvas.current = canvas;
    return () => { offscreenCanvas.current = null; };
  }, []);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const startAnimation = useCallback(() => {
    cancelAnimationFrame(animRaf.current);
    if (typeof window === 'undefined') return;

    const canvas = offscreenCanvas.current;
    if (!canvas) return;

    // Init stateful generators
    if (genMode === 'fire') {
      fireStateRef.current = new FireState(PREVIEW_SIZE, PREVIEW_SIZE);
    }
    if (genMode === 'fireworks') {
      fwStateRef.current = new FireworksState();
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    }

    lastTimeRef.current = performance.now();
    timeRef.current = 0;

    const loop = (ts: number) => {
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = ts;
      timeRef.current += dt;

      if (genMode === 'plasma') {
        renderPlasma(canvas, timeRef.current, { scale: plasmaParams.scale, scheme: plasmaParams.scheme });
      } else if (genMode === 'fire' && fireStateRef.current) {
        for (let i = 0; i < 3; i++) fireStateRef.current.step();
        fireStateRef.current.render(canvas, { scheme: fireScheme });
      } else if (genMode === 'fireworks' && fwStateRef.current) {
        fwStateRef.current.update(PREVIEW_SIZE, PREVIEW_SIZE, dt, { scheme: fwScheme, trailAlpha: fwTrail, particleCount: fwCount });
        fwStateRef.current.render(canvas, { scheme: fwScheme, trailAlpha: fwTrail, particleCount: fwCount });
      }

      if (imgRef.current) imgRef.current.src = canvas.toDataURL('image/jpeg', 0.8);
      animRaf.current = requestAnimationFrame(loop);
    };

    animRaf.current = requestAnimationFrame(loop);
  }, [genMode, plasmaParams.scale, plasmaParams.scheme, fireScheme, fwScheme, fwTrail, fwCount]);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animRaf.current);
  }, []);

  useEffect(() => {
    if (!visible) { stopAnimation(); return; }
    if (tab === 'generate' && animated && ANIMATED_MODES.includes(genMode)) {
      startAnimation();
    } else {
      stopAnimation();
    }
    return stopAnimation;
  }, [visible, tab, animated, genMode, startAnimation, stopAnimation]);

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) { setStaticPreview(null); setError(null); setLoading(false); }
  }, [visible]);

  // ── File picker ────────────────────────────────────────────────────────────
  const pickFile = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,image/svg+xml';
    input.onchange = (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      if (!file) return;
      const isSvg = file.type === 'image/svg+xml' || file.name.endsWith('.svg');
      const reader = new FileReader();
      reader.onload = () => accept(reader.result as string, isSvg ? 'svg' : 'image');
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ── Generate (static capture) ──────────────────────────────────────────────
  const generateStatic = () => {
    if (typeof document === 'undefined') return;
    setLoading(true); setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = fractalParams.size;

      if (FRACTAL_MODES.includes(genMode as any)) {
        renderFractal(canvas, { ...fractalParams, type: genMode as FractalType });
      } else if (genMode === 'plasma') {
        renderPlasma(canvas, Math.random() * 20, plasmaParams);
      } else if (genMode === 'fire') {
        const fs = new FireState(canvas.width, canvas.height);
        for (let i = 0; i < 80; i++) fs.step();
        fs.render(canvas, { scheme: fireScheme });
      } else if (genMode === 'fireworks') {
        const fw = new FireworksState();
        const p = { scheme: fwScheme, trailAlpha: fwTrail, particleCount: fwCount };
        fw.renderStatic(canvas, p);
      }
      const dataUrl = canvas.toDataURL('image/png');
      setStaticPreview(dataUrl);
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
  };

  const captureAnimatedFrame = () => {
    const canvas = offscreenCanvas.current;
    if (!canvas) return;
    setStaticPreview(canvas.toDataURL('image/png'));
  };

  // ── AI ────────────────────────────────────────────────────────────────────
  const generateAi = async () => {
    if (!aiPrompt.trim()) { setError('Enter a prompt first'); return; }
    setLoading(true); setError(null);
    try {
      const dataUrl = await generateAiImage(aiPrompt.trim(), aiSeed);
      setStaticPreview(dataUrl);
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
  };

  // ── Icons ─────────────────────────────────────────────────────────────────
  const searchIcon = async () => {
    if (!iconQuery.trim()) return;
    setLoading(true); setError(null); setIconSearched(true);
    try { setIconResults(await searchIcons(iconQuery.trim())); }
    catch (e) { setErr(e); }
    finally { setLoading(false); }
  };

  const pickIcon = async (icon: IconResult) => {
    setLoading(true); setError(null);
    try {
      const svg = await fetchIconSvg(icon);
      const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      accept(dataUrl, 'svg');
    } catch (e) { setErr(e); }
    finally { setLoading(false); }
  };

  const canAnimate = ANIMATED_MODES.includes(genMode);
  const isFractalMode = FRACTAL_MODES.includes(genMode as any);
  const fpSet = (k: keyof FractalParams, v: any) => setFractalParams(p => ({ ...p, [k]: v }));
  const ppSet = (k: keyof PlasmaParams, v: any) => setPlasmaParams(p => ({ ...p, [k]: v }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
          <View style={s.header}>
            <Text style={[s.title, { color: c.text }]}>Pick Image</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={{ color: c.text, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={s.tabs}>
            {TABS.map(t => (
              <TouchableOpacity key={t.id}
                style={[s.tab, tab === t.id && { borderBottomColor: c.tint, borderBottomWidth: 2 }]}
                onPress={() => { setTab(t.id); setError(null); setStaticPreview(null); }}>
                <Text style={{ color: tab === t.id ? c.tint : c.text, fontSize: 12 }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
            {error && <Text style={s.errorText}>{error}</Text>}

            {/* ── FILE ── */}
            {tab === 'file' && (
              <View style={s.centerSection}>
                <Text style={[s.hint, { color: c.text }]}>Select an image or SVG from your device.</Text>
                <TouchableOpacity style={[s.bigBtn, { backgroundColor: c.tint }]} onPress={pickFile}>
                  <Text style={s.bigBtnText}>Choose File…</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── GENERATE ── */}
            {tab === 'generate' && (
              <View style={{ gap: 12 }}>
                {/* Mode selector */}
                <View>
                  <Text style={{ color: c.text, fontSize: 11, marginBottom: 4, opacity: 0.7 }}>Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {GEN_MODES.map(m => (
                        <TouchableOpacity key={m}
                          style={[s.chip, { borderColor: c.tint, backgroundColor: genMode === m ? c.tint : 'transparent' }]}
                          onPress={() => { setGenMode(m); setStaticPreview(null); }}>
                          <Text style={{ color: genMode === m ? c.bg : c.tint, fontSize: 12 }}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {/* Animated toggle (only for animated modes) */}
                {canAnimate && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: c.text, fontSize: 12 }}>Preview:</Text>
                    {(['animated', 'static'] as const).map(mode => (
                      <TouchableOpacity key={mode}
                        style={[s.chip, { borderColor: c.tint, backgroundColor: (animated ? 'animated' : 'static') === mode ? c.tint : 'transparent' }]}
                        onPress={() => { setAnimated(mode === 'animated'); setStaticPreview(null); }}>
                        <Text style={{ color: (animated ? 'animated' : 'static') === mode ? c.bg : c.tint, fontSize: 12 }}>{mode}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Color scheme picker */}
                {isFractalMode && (
                  <SchemePicker value={fractalParams.scheme} onChange={v => fpSet('scheme', v)} tint={c.tint} textColor={c.text} />
                )}
                {genMode === 'plasma' && (
                  <SchemePicker value={plasmaParams.scheme} onChange={v => ppSet('scheme', v)} tint={c.tint} textColor={c.text} />
                )}
                {genMode === 'fire' && (
                  <SchemePicker value={fireScheme} onChange={setFireScheme} tint={c.tint} textColor={c.text} />
                )}
                {genMode === 'fireworks' && (
                  <SchemePicker value={fwScheme} onChange={setFwScheme} tint={c.tint} textColor={c.text} />
                )}

                {/* Mode-specific params */}
                {isFractalMode && (
                  <View style={{ gap: 6 }}>
                    <RowPair label="Iters">
                      <View style={s.stepRow}>
                        {[64, 128, 256, 512].map(v => (
                          <TouchableOpacity key={v}
                            style={[s.stepBtn, { borderColor: c.tint, backgroundColor: fractalParams.maxIter === v ? c.tint : 'transparent' }]}
                            onPress={() => fpSet('maxIter', v)}>
                            <Text style={{ color: fractalParams.maxIter === v ? c.bg : c.tint, fontSize: 11 }}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </RowPair>
                    {genMode === 'julia' && (
                      <>
                        <RowPair label="Re">
                          <TextInput style={[s.numInput, { color: c.text, borderColor: c.border }]}
                            value={String(fractalParams.juliaRe)} keyboardType="numeric"
                            onChangeText={v => fpSet('juliaRe', parseFloat(v) || 0)} />
                        </RowPair>
                        <RowPair label="Im">
                          <TextInput style={[s.numInput, { color: c.text, borderColor: c.border }]}
                            value={String(fractalParams.juliaIm)} keyboardType="numeric"
                            onChangeText={v => fpSet('juliaIm', parseFloat(v) || 0)} />
                        </RowPair>
                      </>
                    )}
                    <RowPair label="Zoom">
                      <TextInput style={[s.numInput, { color: c.text, borderColor: c.border }]}
                        value={String(fractalParams.zoom)} keyboardType="numeric"
                        onChangeText={v => fpSet('zoom', parseFloat(v) || 0.35)} />
                    </RowPair>
                  </View>
                )}

                {genMode === 'plasma' && (
                  <RowPair label="Scale">
                    <View style={s.stepRow}>
                      {[4, 6, 8, 12, 16].map(v => (
                        <TouchableOpacity key={v}
                          style={[s.stepBtn, { borderColor: c.tint, backgroundColor: plasmaParams.scale === v ? c.tint : 'transparent' }]}
                          onPress={() => ppSet('scale', v)}>
                          <Text style={{ color: plasmaParams.scale === v ? c.bg : c.tint, fontSize: 11 }}>{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </RowPair>
                )}

                {genMode === 'fireworks' && (
                  <View style={{ gap: 6 }}>
                    <RowPair label="Particles">
                      <View style={s.stepRow}>
                        {[60, 120, 200, 350].map(v => (
                          <TouchableOpacity key={v}
                            style={[s.stepBtn, { borderColor: c.tint, backgroundColor: fwCount === v ? c.tint : 'transparent' }]}
                            onPress={() => setFwCount(v)}>
                            <Text style={{ color: fwCount === v ? c.bg : c.tint, fontSize: 11 }}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </RowPair>
                    <RowPair label="Trail">
                      <View style={s.stepRow}>
                        {[0.05, 0.15, 0.3, 0.6].map(v => (
                          <TouchableOpacity key={v}
                            style={[s.stepBtn, { borderColor: c.tint, backgroundColor: Math.abs(fwTrail - v) < 0.01 ? c.tint : 'transparent' }]}
                            onPress={() => setFwTrail(v)}>
                            <Text style={{ color: Math.abs(fwTrail - v) < 0.01 ? c.bg : c.tint, fontSize: 11 }}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </RowPair>
                  </View>
                )}

                {/* Animated preview canvas (via img ref) */}
                {canAnimate && animated && !staticPreview && (
                  <View style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <img
                      ref={(el) => { imgRef.current = el; }}
                      width={PREVIEW_SIZE} height={PREVIEW_SIZE}
                      style={{ borderRadius: 8, maxWidth: '100%' } as any}
                      alt="animated preview"
                    />
                    <TouchableOpacity style={[s.bigBtn, { backgroundColor: c.tint }]} onPress={captureAnimatedFrame}>
                      <Text style={s.bigBtnText}>📸 Capture This Frame</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Static generate button */}
                {(!canAnimate || !animated) && !staticPreview && (
                  <TouchableOpacity style={[s.bigBtn, { backgroundColor: c.tint }]}
                    onPress={generateStatic} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>Generate</Text>}
                  </TouchableOpacity>
                )}

                {/* Static preview + use button */}
                {staticPreview && (
                  <View style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <img src={staticPreview} width={PREVIEW_SIZE} height={PREVIEW_SIZE}
                      style={{ borderRadius: 8, maxWidth: '100%' } as any} alt="preview" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#666' }]}
                        onPress={() => { setStaticPreview(null); if (canAnimate && animated) startAnimation(); }}>
                        <Text style={s.bigBtnText}>↩ Regenerate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.bigBtn, { backgroundColor: c.tint }]}
                        onPress={() => accept(staticPreview)}>
                        <Text style={s.bigBtnText}>✓ Use Image</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── AI ── */}
            {tab === 'ai' && (
              <View style={{ gap: 10 }}>
                <Text style={[s.hint, { color: c.text }]}>Powered by pollinations.ai — no API key required.</Text>
                <TextInput style={[s.promptInput, { color: c.text, borderColor: c.border }]}
                  placeholder="Describe the image…" placeholderTextColor="#888"
                  value={aiPrompt} onChangeText={setAiPrompt} multiline />
                <RowPair label="Seed">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput style={[s.numInput, { color: c.text, borderColor: c.border, width: 70 }]}
                      value={String(aiSeed)} keyboardType="numeric"
                      onChangeText={v => setAiSeed(parseInt(v) || 0)} />
                    <TouchableOpacity onPress={() => setAiSeed(Math.floor(Math.random() * 99999))}>
                      <Text style={{ color: c.tint }}>🎲</Text>
                    </TouchableOpacity>
                  </View>
                </RowPair>
                <TouchableOpacity style={[s.bigBtn, { backgroundColor: c.tint }]}
                  onPress={generateAi} disabled={loading || !aiPrompt.trim()}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>Generate Image</Text>}
                </TouchableOpacity>
                {staticPreview && (
                  <View style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <img src={staticPreview} width={PREVIEW_SIZE} height={PREVIEW_SIZE}
                      style={{ borderRadius: 8, maxWidth: '100%' } as any} alt="preview" />
                    <TouchableOpacity style={[s.bigBtn, { backgroundColor: c.tint }]} onPress={() => accept(staticPreview)}>
                      <Text style={s.bigBtnText}>✓ Use Image</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── ICONS ── */}
            {tab === 'icons' && (
              <View style={{ gap: 8 }}>
                <Text style={[s.hint, { color: c.text }]}>100+ icon libraries including Noun Project (via Iconify).</Text>
                <View style={s.searchRow}>
                  <TextInput style={[s.searchInput, { color: c.text, borderColor: c.border, flex: 1 }]}
                    placeholder="Search icons…" placeholderTextColor="#888"
                    value={iconQuery} onChangeText={setIconQuery}
                    onSubmitEditing={searchIcon} returnKeyType="search" />
                  <TouchableOpacity style={[s.searchBtn, { backgroundColor: c.tint }]} onPress={searchIcon} disabled={loading}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Search</Text>
                  </TouchableOpacity>
                </View>
                {loading && <ActivityIndicator color={c.tint} style={{ marginTop: 16 }} />}
                {!loading && iconSearched && iconResults.length === 0 && (
                  <Text style={[s.hint, { color: c.text, marginTop: 12 }]}>No results found.</Text>
                )}
                <View style={s.iconGrid}>
                  {iconResults.map(icon => (
                    <TouchableOpacity key={icon.id} style={[s.iconCell, { borderColor: c.border }]} onPress={() => pickIcon(icon)}>
                      <img src={`https://api.iconify.design/${icon.prefix}/${icon.name}.svg`}
                        style={{ width: 36, height: 36, objectFit: 'contain' } as any} alt={icon.name} />
                      <Text style={{ color: c.text, fontSize: 9, marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
                        {icon.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RowPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.rowPair}>
      <Text style={{ color: '#888', fontSize: 12, width: 60 }}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, maxHeight: '92%', minHeight: 460 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  closeBtn: { padding: 4 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  content: { padding: 16, paddingBottom: 32 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 18 },
  errorText: { color: '#e44', fontSize: 12, marginBottom: 8 },
  centerSection: { alignItems: 'center', paddingVertical: 24, gap: 16 },
  rowPair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  stepRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  stepBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  numInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, width: 90 },
  promptInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  searchBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  iconCell: { width: 64, alignItems: 'center', padding: 6, borderWidth: 1, borderRadius: 8 },
  bigBtn: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center' },
  bigBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
