import type { MANTRAS as PrinciplesMantras } from './principles.data';
import type { MANTRAS as QuotesMantras } from './quotes.data';

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
 *
 * A video draws from exactly one source collection: principles.data.tsx (the
 * default) or quotes.data.tsx (set `source: 'quotes'` and use `quotes`
 * instead of `principles`) — kept as a discriminated union rather than one
 * loosely-typed field so each variant still gets keyof-checked against its
 * own collection.
 */
interface VideoDefinitionBase {
  id: string;
  /** Title-screen text shown before the video's slides. */
  title: string;
}

export type VideoDefinition = VideoDefinitionBase &
  (
    | {
        source?: 'principles';
        /** Keys into principles.data.tsx's MANTRAS map, in the order they should play. */
        principles: Partial<Record<keyof typeof PrinciplesMantras, VideoPrincipleOptions>>;
      }
    | {
        source: 'quotes';
        /** Keys into quotes.data.tsx's MANTRAS map, in the order they should play. */
        quotes: Partial<Record<keyof typeof QuotesMantras, VideoPrincipleOptions>>;
      }
  );

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
          'BATNA (Best Alternative to a Negotiated Agreement)': {},
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
  {
    label: 'Timeless Quotes',
    videos: [
      {
        id: 'quotes-courage-7',
        title: '7 quotes on courage and taking action',
        source: 'quotes',
        quotes: {
          'Stay hungry, stay foolish': {},
          'If you’re going through hell, keep going': {},
          'Do not go where the path may lead, go instead where there is no path and leave a trail': {},
          'It always seems impossible until it’s done': {},
          'Nothing worth having comes easy': {},
          'Life is either a daring adventure or nothing at all': {},
          'It’s kind of fun to do the impossible': {},
        },
      },
      {
        id: 'quotes-wisdom-7',
        title: '7 quotes on wisdom and truth',
        source: 'quotes',
        quotes: {
          'The unexamined life is not worth living': {},
          'I think, therefore I am': {},
          'Three things cannot be long hidden: the sun, the moon, and the truth': {},
          'The important thing is not to stop questioning': {},
          'Strong minds discuss ideas, average minds discuss events, weak minds discuss people': {},
          'When the student is ready, the teacher will appear': {},
          'If I have seen further it is by standing on the shoulders of giants': {},
        },
      },
      {
        id: 'quotes-perseverance-7',
        title: '7 quotes on perseverance and grit',
        source: 'quotes',
        quotes: {
          'That which does not kill us makes us stronger': {},
          'I have not failed. I’ve just found 10,000 ways that won’t work': {},
          'I’ve missed more than 9000 shots in my career. I’ve failed over and over. That is why I succeed': {},
          'Obstacles don’t have to stop you. If you run into a wall, don’t turn around and give up': {},
          'Fall seven times, stand up eight': {},
          'Success is not final, failure is not fatal: it is the courage to continue that counts': {},
          'Patience is bitter, but its fruit is sweet': {},
        },
      },
      {
        id: 'quotes-change-7',
        title: '7 quotes on change and growth',
        source: 'quotes',
        quotes: {
          'Be the change that you wish to see in the world': {},
          'The only thing we have to fear is fear itself': {},
          'The best time to plant a tree was 20 years ago. The second best time is now': {},
          'Turn your wounds into wisdom': {},
          'You become what you believe': {},
          'We are what we repeatedly do. Excellence, then, is not an act, but a habit': {},
          'Whatever you are, be a good one': {},
        },
      },
      {
        id: 'quotes-dreams-7',
        title: '7 quotes on dreams and vision',
        source: 'quotes',
        quotes: {
          'The future belongs to those who believe in the beauty of their dreams': {},
          'All our dreams can come true, if we have the courage to pursue them': {},
          'If you can dream it, you can do it': {},
          'Imagination is more important than knowledge': {},
          'Everything you can imagine is real': {},
          'Logic will get you from A to B. Imagination will take you everywhere': {},
          'The biggest adventure you can take is to live the life of your dreams': {},
        },
      },
      {
        id: 'quotes-simplicity-7',
        title: '7 quotes on simplicity and creativity',
        source: 'quotes',
        quotes: {
          'Simplicity is the ultimate sophistication': {},
          'Art is never finished, only abandoned': {},
          'Action is the foundational key to all success': {},
          'The best and most beautiful things in the world cannot be seen or even touched — they must be felt with the heart': {},
          'Genius is one percent inspiration and ninety-nine percent perspiration': {},
          'Be yourself; everyone else is already taken': {},
          'To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment': {},
        },
      },
      {
        id: 'quotes-kindness-7',
        title: '7 quotes on kindness and connection',
        source: 'quotes',
        quotes: {
          'Kindness is a language which the deaf can hear and the blind can see': {},
          'I destroy my enemies when I make them my friends': {},
          'Injustice anywhere is a threat to justice everywhere': {},
          'Darkness cannot drive out darkness; only light can do that': {},
          'Be kind whenever possible. It is always possible': {},
          'Peace comes from within. Do not seek it without': {},
          'We are all in the gutter, but some of us are looking at the stars': {},
        },
      },
    ],
  },
];
