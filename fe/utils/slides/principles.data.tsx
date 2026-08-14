import type { MantraEntry } from '@/utils/mcon.config';
export { MCON_VISUAL_PARAMS } from '@/utils/mcon.config';
export type { MantraEntry, MantraText } from '@/utils/mcon.config';

export const MANTRAS: Record<string, MantraEntry> = {
  'Swiss-cheesing': {
    examples: 'Poke holes in a big task wherever it is easiest, instead of attacking it in order',
  },
  'Divide and conquer': {
    examples: 'Break a large problem into smaller independent sub-problems',
  },
  'Pareto principle (80/20)': {
    examples: '80% of results come from 20% of effort — find that 20%',
  },
  "Parkinson's Law": {
    examples: 'Work expands to fill the time allotted for its completion',
  },
  'Eisenhower Matrix': {
    examples: 'Sort tasks by urgent vs important, not just by deadline',
  },
  'Zeigarnik effect': {
    examples: 'Unfinished tasks stick in memory and create nagging tension',
  },
  'Compulsion to closure': {
    examples: 'The mind craves finishing what it started — use it to your advantage',
  },
  'Sunk cost fallacy': {
    examples: "Don't keep investing just because you already invested",
  },
  'Opportunity cost': {
    examples: 'Every choice is also the cost of the next-best option foregone',
  },
  'Loss aversion': {
    examples: 'Losses loom larger than equivalent gains',
  },
  'Anchoring bias': {
    examples: 'The first number seen skews all later judgments',
  },
  'Confirmation bias': {
    examples: 'We seek evidence that confirms what we already believe',
  },
  'Availability heuristic': {
    examples: 'We overweight what comes easily to mind',
  },
  'Dunning-Kruger effect': {
    examples: 'The less you know, the more confident you may feel',
  },
  'Halo effect': {
    examples: 'One good trait makes everything about someone seem better',
  },
  'Spotlight effect': {
    examples: 'People notice you far less than you think they do',
  },
  'Self-fulfilling prophecy': {
    examples: 'Expecting an outcome can cause behavior that brings it about',
  },
  'Growth mindset': {
    sentiment: 'growth',
    examples: 'Abilities can be developed through effort, not fixed at birth',
  },
  'Fixed mindset (avoid)': {
    examples: 'Believing talent is static leads to avoiding challenges',
  },
  'Locus of control': {
    examples: 'Believing outcomes depend on your actions, not fate',
  },
  'Self-efficacy': {
    examples: 'Belief in your own capability to succeed at a task',
  },
  'Learned helplessness': {
    examples: 'Repeated failure can teach passivity even when escape is possible',
  },
  'Delayed gratification': {
    examples: 'Trading a smaller reward now for a bigger one later',
  },
  'Marshmallow test': {
    examples: 'Self-control in childhood predicts later life outcomes',
  },
  Grit: {
    sentiment: 'hardcore',
    examples: 'Passion and perseverance for long-term goals',
  },
  'Deliberate practice': {
    examples: 'Focused, feedback-driven practice just past your comfort zone',
  },
  '10,000-hour rule': {
    examples: 'Mastery tends to require roughly a decade of deliberate practice',
  },
  'Flow state': {
    sentiment: 'focus',
    examples: 'Full immersion when challenge matches skill',
  },
  'Habit stacking': {
    examples: 'Attach a new habit to an existing one as a trigger',
  },
  'Temptation bundling': {
    examples: 'Pair something you should do with something you want to do',
  },
  'Implementation intentions': {
    examples: 'Plan the exact when/where/how in advance, not just the goal',
  },
  'If-then planning': {
    examples: '"If X happens, then I will do Y" — pre-decide under pressure',
  },
  'Keystone habits': {
    examples: 'One habit that triggers a cascade of other good habits',
  },
  'Identity-based habits': {
    examples: "Change who you believe you are, and behavior follows",
  },
  'Environment design': {
    examples: 'Shape your surroundings so good choices are the easy ones',
  },
  'Friction reduction': {
    examples: 'Remove small obstacles between you and the desired action',
  },
  'Choice architecture': {
    examples: 'How options are presented shapes which one gets picked',
  },
  'Nudge theory': {
    examples: 'Small design changes steer behavior without restricting choice',
  },
  'Default effect': {
    examples: 'People overwhelmingly stick with the pre-set option',
  },
  'Decision fatigue': {
    examples: 'Judgment quality degrades after many decisions in a row',
  },
  'Ego depletion': {
    examples: 'Willpower can be temporarily drained like a limited resource',
  },
  'Willpower as a muscle': {
    examples: 'It fatigues with use but also strengthens with training',
  },
  'Future self continuity': {
    examples: 'Treat your future self like someone you actually care about',
  },
  'Mental contrasting (WOOP)': {
    examples: 'Wish, Outcome, Obstacle, Plan — pair optimism with realism',
  },
  Visualization: {
    sentiment: 'dreaming',
    examples: 'Mentally rehearse success to prime real performance',
  },
  'Positive self-talk': {
    examples: 'The inner voice shapes confidence and follow-through',
  },
  'Cognitive reframing': {
    examples: 'Change the meaning you attach to an event, not the event',
  },
  'Gratitude practice': {
    sentiment: 'loving',
    examples: 'Regularly noting what is good rewires baseline mood',
  },
  Journaling: {
    examples: 'Writing thoughts down externalizes and clarifies them',
  },
  'After-action review': {
    examples: 'What was expected, what happened, why, what to change',
  },
  'Premortem analysis': {
    examples: 'Imagine the project failed — work backward to find the causes now',
  },
  'Second-order thinking': {
    examples: 'Ask "and then what?" beyond the immediate consequence',
  },
  'First-principles thinking': {
    examples: 'Break a problem down to fundamental truths and rebuild up',
  },
  "Inversion (Munger)": {
    examples: 'Solve a problem by studying how to guarantee its failure',
  },
  'Circle of competence': {
    examples: 'Know the boundary of what you truly understand',
  },
  Antifragility: {
    examples: 'Some systems get stronger, not just survive, from stress',
  },
  'Black swan awareness': {
    examples: 'Rare, high-impact events dominate outcomes more than expected',
  },
  'Regret minimization': {
    examples: 'Choose the path your future self is least likely to regret',
  },
  'Status quo bias': {
    examples: 'Preference for the current state of affairs, just because it is current',
  },
  'Endowment effect': {
    examples: 'We overvalue things simply because we own them',
  },
  'Hyperbolic discounting': {
    examples: 'Smaller-sooner rewards are overweighted vs larger-later ones',
  },
  'Present bias': {
    examples: 'The now feels far more urgent than it objectively is',
  },
  'Commitment devices': {
    examples: 'Lock in future behavior now, while willpower is strong',
  },
  'Accountability partners': {
    examples: 'Public commitment to another person raises follow-through',
  },
  'Social proof': {
    examples: "We look to others' behavior to decide what is correct",
  },
  'Reciprocity principle': {
    examples: 'People feel obliged to return favors',
  },
  'Consistency principle': {
    examples: 'Once we commit, we feel pressure to act consistently with it',
  },
  'Foot-in-the-door technique': {
    examples: 'A small first request makes a larger one easier to accept',
  },
  'Scarcity principle': {
    examples: 'Perceived scarcity increases perceived value',
  },
  'Authority bias': {
    examples: 'We defer to perceived experts, sometimes uncritically',
  },
  'Liking principle': {
    examples: 'We say yes more easily to people we like',
  },
  "Cialdini's six principles of influence": {
    examples: 'Reciprocity, commitment, social proof, authority, liking, scarcity',
  },
  'Swiss cheese model': {
    examples: 'Layer independent defenses so no single failure causes disaster',
  },
  "Occam's razor": {
    examples: 'Prefer the simplest explanation that fits the facts',
  },
  "Hanlon's razor": {
    examples: "Don't attribute to malice what is adequately explained by carelessness",
  },
  "Chesterton's fence": {
    examples: "Don't remove a rule until you understand why it was put there",
  },
  "Maslow's hierarchy of needs": {
    examples: 'Basic needs must be met before higher ones motivate behavior',
  },
  'Self-determination theory': {
    examples: 'Autonomy, mastery, and purpose drive intrinsic motivation',
  },
  'Intrinsic vs extrinsic motivation': {
    examples: 'Internal drive tends to outlast external rewards and pressure',
  },
  'Flow channel': {
    examples: 'Stay in the zone between boredom and anxiety by matching skill to challenge',
  },
  'Spaced repetition': {
    examples: 'Review material at increasing intervals to lock it into memory',
  },
  'Active recall': {
    examples: 'Testing yourself beats passively re-reading',
  },
  'Feynman technique': {
    examples: "Explain it simply enough to teach a child — gaps reveal what you don't know",
  },
  'Pomodoro technique': {
    examples: 'Work in focused sprints with short breaks between them',
  },
  'Time blocking': {
    examples: 'Assign every hour a job instead of working from an open list',
  },
  Batching: {
    examples: 'Group similar tasks together to cut context-switching cost',
  },
  'Eat the frog': {
    examples: 'Do the hardest, most important task first thing in the day',
  },
  'Two-minute rule': {
    examples: 'If it takes under two minutes, do it now instead of queuing it',
  },
  'Five-second rule': {
    examples: 'Count down 5-4-3-2-1 and physically move before hesitation wins',
  },
  'Habit loop': {
    examples: 'Cue, routine, reward — the three-part structure of every habit',
  },
  'GTD (getting things done)': {
    examples: 'Capture everything externally so your mind can stop holding it',
  },
  OKRs: {
    examples: 'Objectives and measurable Key Results, reviewed on a cadence',
  },
  'SMART goals': {
    examples: 'Specific, Measurable, Achievable, Relevant, Time-bound',
  },
  Kaizen: {
    categories: { efficiency: {} },
    examples: 'Continuous small improvements compound into large ones',
  },
  'MoSCoW method': {
    examples: 'Must have, Should have, Could have, Won\'t have — for prioritizing scope',
  },
  'Premature optimization avoidance': {
    examples: "Don't polish or optimize before you know it's the bottleneck",
  },
  "Dunbar's number": {
    examples: 'Roughly 150 is the cognitive limit on stable social relationships',
  },
  'Bystander effect': {
    examples: 'The more people present, the less likely any one helps',
  },
  'Peak-end rule': {
    examples: 'We judge an experience mostly by its peak and its ending',
  },
  'Survivorship bias': {
    examples: 'We only see the successes, so we underestimate the failure rate',
  },
};
