import type { MANTRAS as PrinciplesMantras } from './principles.data';

/** Placeholder for future per-video-per-principle overrides (e.g. a custom duration). Empty for now — using an object (not `true`/`null`) leaves that door open without a breaking type change later. */
export type VideoPrincipleOptions = Record<string, never>;

/**
 * Declarative video definitions: each video is a curated, ordered subset of
 * principles from principles.data.tsx, with its own title-screen text. A
 * principle can appear in more than one video when it genuinely fits more
 * than one theme (see decisions-7 reusing two entries from smarter-7 below)
 * — this is a many-to-many mapping onto principles.data.tsx, not a partition
 * of it.
 *
 * `principles` is an object keyed by principle title, not an array — object
 * keys can't repeat (TypeScript flags a duplicate key as a compile error), so
 * the same principle can't accidentally be listed twice in one video. Key
 * order is preserved and is the play order.
 */
export interface VideoDefinition {
  id: string;
  /** Title-screen text shown before the video's principle slides. */
  title: string;
  /** Keys into principles.data.tsx's MANTRAS map, in the order they should play. */
  principles: Partial<Record<keyof typeof PrinciplesMantras, VideoPrincipleOptions>>;
}

export interface VideoCategory {
  label: string;
  videos: VideoDefinition[];
}

export const VIDEO_CATEGORIES: VideoCategory[] = [
  {
    label: 'Psychological Principles',
    videos: [
      {
        id: 'smarter-7',
        title: '7 psychological principles to make you smarter',
        principles: {
          'First-principles thinking': {},
          'Second-order thinking': {},
          'Inversion (Munger)': {},
          "Occam's razor": {},
          'Circle of competence': {},
          'Premortem analysis': {},
          'Regret minimization': {},
        },
      },
      {
        id: 'counter-intuitive-7',
        title: '7 counter-intuitive psychological principles that can surprise you',
        principles: {
          'Loss aversion': {},
          'Dunning-Kruger effect': {},
          'Sunk cost fallacy': {},
          'Spotlight effect': {},
          'Self-fulfilling prophecy': {},
          'Halo effect': {},
          'Survivorship bias': {},
        },
      },
      {
        id: 'decisions-7',
        title: '7 mental models for better decision-making',
        principles: {
          // Reused from smarter-7: both are explicitly decision tools, not
          // just general "thinking sharper" principles — a deliberate overlap.
          'Premortem analysis': {},
          'Inversion (Munger)': {},
          'Anchoring bias': {},
          'Confirmation bias': {},
          'Availability heuristic': {},
          "Hanlon's razor": {},
          "Chesterton's fence": {},
        },
      },
      {
        id: 'productivity-7',
        title: '7 productivity principles that will change how you work',
        principles: {
          'Pareto principle (80/20)': {},
          "Parkinson's Law": {},
          'Eisenhower Matrix': {},
          'Time blocking': {},
          'Eat the frog': {},
          'Two-minute rule': {},
          'Pomodoro technique': {},
        },
      },
      {
        id: 'habits-7',
        title: '7 habit-building principles backed by psychology',
        principles: {
          'Habit stacking': {},
          'Temptation bundling': {},
          'Implementation intentions': {},
          'Environment design': {},
          'Friction reduction': {},
          'Habit loop': {},
          'Keystone habits': {},
        },
      },
    ],
  },
  {
    label: 'Better Thinking',
    videos: [
      {
        id: 'better-decisions-7',
        title: '7 principles for better decisions',
        principles: {
          'Expected value': {},
          'Base-rate thinking': {},
          'Bayesian updating': {},
          Calibration: {},
          Falsifiability: {},
          'Disconfirming evidence': {},
          'Decision journal': {},
        },
      },
      {
        id: 'avoid-thinking-traps-7',
        title: '7 thinking traps to avoid',
        principles: {
          'Planning fallacy': {},
          'Hindsight bias': {},
          'Curse of knowledge': {},
          'Framing effect': {},
          'Recency bias': {},
          'Fundamental attribution error': {},
          'Negativity bias': {},
        },
      },
      {
        id: 'strategy-under-uncertainty-7',
        title: '7 principles for strategy under uncertainty',
        principles: {
          'Margin of safety': {},
          Optionality: {},
          'Barbell strategy': {},
          'Black swan awareness': {},
          'Two-way door decisions': {},
          'Portfolio of experiments': {},
          'Asymmetric upside': {},
        },
      },
      {
        id: 'learn-faster-7',
        title: '7 science-backed ways to learn faster',
        principles: {
          'Active recall': {},
          'Spaced repetition': {},
          Interleaving: {},
          Elaboration: {},
          'Dual coding': {},
          'Teach-back': {},
          'Desirable difficulty': {},
        },
      },
    ],
  },
  {
    label: 'Work and Execution',
    videos: [
      {
        id: 'deep-focus-7',
        title: '7 rules for deep focus',
        principles: {
          'Deep work': {},
          Monotasking: {},
          'Attention residue': {},
          'Maker-manager schedule': {},
          Batching: {},
          'Energy management': {},
          'Ultradian rhythm': {},
        },
      },
      {
        id: 'execute-better-7',
        title: '7 principles to execute better',
        principles: {
          'Systems over goals': {},
          'Leading indicators': {},
          'Feedback loops': {},
          'PDCA cycle': {},
          'Definition of done': {},
          'Finish lines matter': {},
          'Ship, then improve': {},
        },
      },
      {
        id: 'fix-workflow-7',
        title: '7 principles to fix your workflow',
        principles: {
          'Theory of constraints': {},
          'Little’s law': {},
          'Kanban pull system': {},
          'Single-piece flow': {},
          'Make work visible': {},
          'Weekly review': {},
          'Inbox zero as triage': {},
        },
      },
      {
        id: 'build-lasting-habits-7',
        title: '7 rules for habits that last',
        principles: {
          'Minimum viable habit': {},
          'Never miss twice': {},
          'Habit tracking': {},
          'Fresh start effect': {},
          'Identity-based habits': {},
          'Commitment devices': {},
          'Accountability partners': {},
        },
      },
      {
        id: 'run-better-experiments-7',
        title: '7 rules for experiments that teach you something',
        principles: {
          'Smallest viable experiment': {},
          'Build-measure-learn': {},
          'Pre-registration of bets': {},
          'Kill criteria': {},
          'Red team review': {},
          'After-action review': {},
          'Double-loop learning': {},
        },
      },
    ],
  },
  {
    label: 'People and a Good Life',
    videos: [
      {
        id: 'stronger-teams-7',
        title: '7 principles for stronger teams',
        principles: {
          'Psychological safety': {},
          'Radical candor': {},
          'Working agreements': {},
          'DRI ownership': {},
          'Context, not control': {},
          'Disagree and commit': {},
          'Give credit generously': {},
        },
      },
      {
        id: 'negotiate-better-7',
        title: '7 principles to negotiate better',
        principles: {
          'Interests over positions': {},
          'BATNA awareness': {},
          'Tactical empathy': {},
          Mirroring: {},
          'Labeling in negotiation': {},
          'Ask calibrated questions': {},
          'Separate people from problems': {},
        },
      },
      {
        id: 'resilience-7',
        title: '7 principles for resilient progress',
        principles: {
          'Self-compassion': {},
          'Learned optimism': {},
          'Stress inoculation': {},
          'Response flexibility': {},
          'Behavioral activation': {},
          'Antifragile mindset': {},
          'Do the next right thing': {},
        },
      },
      {
        id: 'meaningful-life-7',
        title: '7 principles for a more meaningful life',
        principles: {
          'Values-based action': {},
          'Purpose alignment': {},
          'Eudaimonic wellbeing': {},
          'Savoring': {},
          'Gratitude practice': {},
          'Long-term orientation': {},
          Craftsmanship: {},
        },
      },
    ],
  },
];
