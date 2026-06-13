export type MantraText = string | readonly string[];

export type MantraEntry = {
  text?: MantraText;
  sentiment?:
  | "loving"
  | "growth"
  | "hardcore"
  | "dreaming"
  | "calm"
  | "focus"
  | string;
  emotion?: string;
  style?: string;
};

export const MANTRAS: Record<string, MantraEntry> = {
  "thoughts are things": {
    sentiment: "growth",
    emotion: "focus",
    style: "neon",
  },
  "exploit parallelisms": {},
  "trust the system": {},
  "be good at\nfigureouting": {},
  "9 women can't have a baby in 1 month": {},
  "accept or overcome or workarounds": {},
  "program my mind": { sentiment: "growth", emotion: "focus", style: "neon" },
  "mind like water": { sentiment: "calm", emotion: "peace", style: "organic" },
  resilience: { sentiment: "hardcore", emotion: "grit", style: "metallic" },
  strength: { sentiment: "hardcore", emotion: "grit", style: "metallic" },
  "push yourself": { sentiment: "hardcore", emotion: "grit", style: "metallic" },
  "8 to be great": { sentiment: "hardcore", emotion: "grit", style: "metallic" },
  tenacity: {
    sentiment: "hardcore",
    emotion: "determination",
    style: "metallic",
  },
  persistence: {
    sentiment: "hardcore",
    emotion: "determination",
    style: "metallic",
  },
  readiness: { sentiment: "hardcore", emotion: "alertness", style: "bold" },
  "invest in you inc.": {
    sentiment: "growth",
    emotion: "ambition",
    style: "clean",
  },
  "be the best\nversion\nof yourself": {
    sentiment: "growth",
    emotion: "inspiration",
    style: "warm",
  },
  "daydreaming is good": { sentiment: "dreaming", emotion: "wonder", style: "dreamy" },
  "greed is good": {},
  "anarcho capitalism\nblack&yellow": {},
  "micro-protocols": {
    sentiment: "hardcore",
    emotion: "discipline",
    style: "cyberpunk",
  },
  "micro-meditations": {
    sentiment: "calm",
    emotion: "tranquility",
    style: "organic",
  },
  mantras: { sentiment: "focus", emotion: "centering", style: "minimalist" },
  "micro-prayers": { sentiment: "loving", emotion: "devotion", style: "warm" },
  affirmations: { sentiment: "loving", emotion: "self-love", style: "dreamy" },
  "«dance is the answer»": {
    sentiment: "dreaming",
    emotion: "joy",
    style: "disco",
  },
  "will to psi power": {
    sentiment: "hardcore",
    emotion: "empowerment",
    style: "neon",
  },
  "build habits": {
    sentiment: "growth",
    emotion: "persistence",
    style: "minimalist",
  },
  "build habit chains": {
    sentiment: "growth",
    emotion: "structure",
    style: "grid",
  },
  "internalize ideas, values": {
    sentiment: "growth",
    emotion: "wisdom",
    style: "classic",
  },
  "ora et labora": { sentiment: "hardcore", emotion: "duty", style: "classic" },
  "miłość\npiękno": {
    sentiment: "loving",
    emotion: "love & beauty",
    style: "dreamy",
  },
  "muscle memory\nkeyboard shortcuts": {
    sentiment: "focus",
    emotion: "mastery",
    style: "cyberpunk",
  },
  "form follows function": {
    sentiment: "focus",
    emotion: "clarity",
    style: "minimalist",
  },
  "inner strength": {},
  "exponential growth": {},
  "I have known many problems,\nmost of which never happened": {},
  "dare to dream": {},
  "constant improvement and learning": {},
  "simplicity is the ultimate sophistication\nsimple but not primitive": {
    sentiment: "calm",
    emotion: "sophistication",
    style: "minimalist",
  },
  "glass is half full": {
    sentiment: "loving",
    emotion: "optimism",
    style: "organic",
  },
  "self-love": { sentiment: "loving", emotion: "compassion", style: "warm" },
  "flow state": { sentiment: "focus", emotion: "immersion", style: "neon" },
};
