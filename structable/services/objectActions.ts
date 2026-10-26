import type { DataRow } from '../types/table';
import { REST_BASE } from './apiBase';
import { fileRefsOf, type FileRef } from './fileStore';

/**
 * Object actions: operations a class enables on its instances. A class opts in by listing action ids
 * in its `object_actions` field (Classes table); the row menu of that class's table then offers them.
 */
export type ObjectActionContext = {
  row: DataRow;
  rowTitle: string;
  /** Write a cell of this row through the normal sync path. */
  setCell: (columnId: string, value: unknown) => void;
};

export type ObjectAction = {
  id: string;
  label: string;
  /** Short progress text while running. */
  runningLabel: string;
  /** Resolves to a human-readable result message. */
  run: (context: ObjectActionContext) => Promise<string>;
};

export const OBJECT_ACTIONS_FIELD = 'object_actions';

// Audiobook attribute ids used by the Voicebox action.
const SCRIPT_TEXT_COL = 'script_text';
const VOICE_COL = 'voice';
const AUDIO_COL = 'audio';
const TTS_DURATION_COL = 'tts_generation_duration';

type VoiceboxRenderResponse = { file: FileRef; duration_seconds: number; audio_seconds: number; chunks: number; voice: string };

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

const renderAudiobookWithVoicebox: ObjectAction = {
  id: 'render_audiobook_voicebox',
  label: 'Render audiobook (Voicebox)',
  runningLabel: 'Rendering audiobook with Voicebox…',
  async run({ row, rowTitle, setCell }) {
    const text = String(row[SCRIPT_TEXT_COL] ?? '').trim();
    if (!text) throw new Error('Script Text is empty');
    const res = await fetch(`${REST_BASE}/voicebox/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: row[VOICE_COL] ?? null, name: rowTitle }),
    });
    if (!res.ok) throw new Error(await res.text());
    const result = (await res.json()) as VoiceboxRenderResponse;
    setCell(AUDIO_COL, [...fileRefsOf(row[AUDIO_COL]), result.file]);
    setCell(TTS_DURATION_COL, result.duration_seconds);
    return `Rendered ${formatSeconds(result.audio_seconds)} of audio (voice: ${result.voice}) in ${result.duration_seconds} s`;
  },
};

const ACTIONS_BY_ID = new Map([renderAudiobookWithVoicebox].map((action) => [action.id, action]));

/** Actions enabled by a class row (its `object_actions`: list of ids, or comma/space separated text). */
export function actionsForClass(classRow: DataRow | undefined): ObjectAction[] {
  const raw = classRow?.[OBJECT_ACTIONS_FIELD];
  const ids = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[\s,]+/) : [];
  return ids.map((id) => ACTIONS_BY_ID.get(id.trim())).filter((action): action is ObjectAction => !!action);
}
