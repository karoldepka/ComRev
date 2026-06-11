export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const AI_EFFECT_SYSTEM_PROMPT = `You are a creative Three.js developer. Generate JavaScript code for a visual 3D text effect.

The code is wrapped in: new Function('THREE', yourCode)(THREE)
It has access to the \`THREE\` library and must end with a \`return\` statement returning a plain object implementing some or all of these methods:

{
  name: string,                             // required — short camelCase name
  setup(ctx),                               // called once after Three.js is ready
  onMeshChanged(mesh, ctx),                // called when the text mesh is rebuilt
  update(ctx),                             // called every animation frame
  addComposerPass(composer, ctx),          // for post-process shader effects (EffectComposer / ShaderPass)
  dispose()                                // cleanup (remove scene objects, dispose geometry/materials)
}

ctx properties:
  ctx.time     — elapsed seconds since start
  ctx.delta    — seconds since last frame
  ctx.mesh     — THREE.Group/Mesh of the 3D text (null before first load)
  ctx.scene    — THREE.Scene
  ctx.camera   — THREE.PerspectiveCamera
  ctx.renderer — THREE.WebGLRenderer

Tips:
• Animation: modify ctx.mesh.rotation / position / scale in update()
• Vertex deform: traverse children, modify geometry.attributes.position.array, then set needsUpdate=true
• Particles / scene objects: add objects to ctx.scene in setup/onMeshChanged; remove them in dispose()
• Keep per-frame state in closure variables (e.g. const state = { phase: 0 })
• Always guard: if (!ctx.mesh) return;

Return ONLY raw JavaScript — no markdown code fences, no prose, no explanations.`;

export type AiProvider = 'anthropic' | 'ollama';

export async function callAiEffectApi(
  messages: AiMessage[],
  apiKey: string,
  model = 'claude-sonnet-4-6',
  endpoint = 'https://api.anthropic.com',
  provider: AiProvider = 'anthropic',
): Promise<string> {
  if (provider === 'ollama') {
    return callOllamaApi(messages, model, endpoint);
  }
  const url = `${endpoint.replace(/\/$/, '')}/v1/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: AI_EFFECT_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI API error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return (data.content?.[0]?.text as string) ?? '';
}

async function callOllamaApi(
  messages: AiMessage[],
  model: string,
  ollamaBase: string,
): Promise<string> {
  const base = ollamaBase.replace(/\/$/, '');
  // Use OpenAI-compatible endpoint (available in Ollama ≥ 0.1.24)
  const url = `${base}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: AI_EFFECT_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama error ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content as string) ?? '';
}

/** Strip markdown code fences if the model wraps the code anyway. */
export function extractCode(raw: string): string {
  const fenced = raw.match(/```(?:javascript|js|typescript|ts)?\n?([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

const LS_API_KEY = 'aiEffect_apiKey';
const LS_MODEL = 'aiEffect_model';
const LS_PROVIDER = 'aiEffect_provider';
const LS_OLLAMA_URL = 'aiEffect_ollamaUrl';
const LS_OLLAMA_MODEL = 'aiEffect_ollamaModel';

function ls(op: 'get', key: string): string;
function ls(op: 'set', key: string, val: string): void;
function ls(op: 'get' | 'set', key: string, val?: string): string | void {
  try {
    if (op === 'get') return localStorage.getItem(key) ?? '';
    if (val !== undefined) localStorage.setItem(key, val);
  } catch { /* SSR / private browsing */ }
  return '';
}

export const getStoredApiKey = () => ls('get', LS_API_KEY);
export const setStoredApiKey = (k: string) => ls('set', LS_API_KEY, k);
export const getStoredModel = () => ls('get', LS_MODEL) || 'claude-sonnet-4-6';
export const setStoredModel = (m: string) => ls('set', LS_MODEL, m);
export const getStoredProvider = (): AiProvider => (ls('get', LS_PROVIDER) as AiProvider) || 'anthropic';
export const setStoredProvider = (p: AiProvider) => ls('set', LS_PROVIDER, p);
export const getStoredOllamaUrl = () => ls('get', LS_OLLAMA_URL) || 'http://localhost:11434';
export const setStoredOllamaUrl = (u: string) => ls('set', LS_OLLAMA_URL, u);
export const getStoredOllamaModel = () => ls('get', LS_OLLAMA_MODEL) || 'qwen2.5-coder:7b';
export const setStoredOllamaModel = (m: string) => ls('set', LS_OLLAMA_MODEL, m);
