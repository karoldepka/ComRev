import { API_BASE } from './api-config';

export type InspirationKind =
  | 'motto'
  | 'famous_people_quote'
  | 'mantra'
  | 'affirmation'
  | 'value'
  | 'belief'
  | 'quality';

export interface InspirationItem {
  kind: InspirationKind;
  text: string;
  author_name?: string | null;
  source_note?: string | null;
}

export interface InspirationGenerateRequest {
  prompt: string;
  kinds?: InspirationKind[];
  count_per_kind?: number;
}

export interface InspirationGenerateResponse {
  prompt: string;
  normalized_prompt: string;
  items: InspirationItem[];
  generated_by: string;
}

export const DEFAULT_INSPIRATION_KINDS: InspirationKind[] = [
  'motto',
  'famous_people_quote',
  'mantra',
  'affirmation',
  'value',
  'belief',
  'quality',
];

export const INSPIRATION_KIND_LABELS: Record<InspirationKind, string> = {
  motto: 'Mottos',
  famous_people_quote: 'Famous people quotes',
  mantra: 'Mantras',
  affirmation: 'Affirmations',
  value: 'Values',
  belief: 'Beliefs',
  quality: 'Qualities',
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'for',
  'from',
  'give',
  'help',
  'into',
  'make',
  'me',
  'my',
  'of',
  'on',
  'our',
  'please',
  'the',
  'to',
  'with',
]);

const LOCAL_TEMPLATES: Record<Exclude<InspirationKind, 'famous_people_quote'>, string[]> = {
  motto: [
    'Build {theme} with steady hands.',
    '{Theme}: honest work, visible progress.',
    'Make {theme} useful, durable, and kind.',
  ],
  mantra: [
    'One clear step for {theme}.',
    'Return to the work; protect the signal.',
    'Calm focus, then momentum.',
  ],
  affirmation: [
    'I can turn {theme} into a concrete next step.',
    'I keep promises to the work and to myself.',
    'I learn, adjust, and continue.',
  ],
  value: [
    'Clarity before scale.',
    'Progress that users can trust.',
    'Craft in service of usefulness.',
  ],
  belief: [
    '{Theme} grows through small decisions repeated well.',
    'The next honest experiment is enough to move forward.',
    'Better tools can make better collaboration ordinary.',
  ],
  quality: ['Patient ambition', 'Practical courage', 'Careful momentum'],
};

const LOCAL_QUOTES = [
  { text: 'Well done is better than well said.', author_name: 'Benjamin Franklin' },
  { text: 'Energy and persistence conquer all things.', author_name: 'Benjamin Franklin' },
  {
    text: 'Genius is one percent inspiration and ninety-nine percent perspiration.',
    author_name: 'Thomas Edison',
  },
  { text: 'To thine own self be true.', author_name: 'William Shakespeare' },
  { text: 'No great thing is created suddenly.', author_name: 'Epictetus' },
  { text: 'He who is brave is free.', author_name: 'Seneca' },
];

export async function generateInspiration(
  request: InspirationGenerateRequest,
  endpoint = API_BASE,
): Promise<{ response: InspirationGenerateResponse; usedFallback: boolean }> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/inspiration/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        kinds: request.kinds ?? DEFAULT_INSPIRATION_KINDS,
        count_per_kind: request.count_per_kind ?? 3,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Generator API error ${res.status}: ${text.slice(0, 240)}`);
    }
    return { response: await res.json(), usedFallback: false };
  } catch (error) {
    console.warn('Falling back to local inspiration generator', error);
    return { response: generateInspirationLocally(request), usedFallback: true };
  }
}

export function groupInspirationItems(items: InspirationItem[]) {
  return DEFAULT_INSPIRATION_KINDS.map((kind) => ({
    kind,
    label: INSPIRATION_KIND_LABELS[kind],
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);
}

function generateInspirationLocally(request: InspirationGenerateRequest): InspirationGenerateResponse {
  const prompt = request.prompt.trim();
  const normalized = prompt.toLowerCase().replace(/\s+/g, ' ');
  const seed = stableSeed(prompt);
  const theme = keywords(prompt).slice(0, 4).join(' ') || 'the work';
  const focus = keywords(prompt)[0] ?? 'progress';
  const kinds = request.kinds ?? DEFAULT_INSPIRATION_KINDS;
  const count = Math.min(Math.max(request.count_per_kind ?? 3, 1), 8);
  const items: InspirationItem[] = [];

  for (const kind of kinds) {
    for (let i = 0; i < count; i += 1) {
      if (kind === 'famous_people_quote') {
        const quote = pick(LOCAL_QUOTES, seed, i);
        items.push({ kind, ...quote, source_note: `Selected for: ${theme}` });
        continue;
      }
      const template = pick(LOCAL_TEMPLATES[kind], seed, i);
      items.push({
        kind,
        text: template
          .replaceAll('{theme}', theme)
          .replaceAll('{Theme}', capitalize(theme))
          .replaceAll('{focus}', focus),
      });
    }
  }

  return {
    prompt,
    normalized_prompt: normalized,
    items,
    generated_by: 'typescript-local-template-generator-v1',
  };
}

function pick<T>(items: T[], seed: number, index: number): T {
  return items[(seed + index) % items.length];
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function keywords(prompt: string): string[] {
  const words = prompt.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
  const filtered = words.filter((word) => !STOP_WORDS.has(word));
  return filtered.length ? filtered : words;
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}
