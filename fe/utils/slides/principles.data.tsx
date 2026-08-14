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
  'Systems over goals': {
    examples:
      'Build repeatable processes; goals set direction, systems create daily progress',
  },
  Compounding: {
    examples:
      'Small gains repeated consistently become disproportionately valuable over time',
  },
  'Margin of safety': {
    examples:
      'Leave room for error, delay, and bad luck instead of planning at maximum capacity',
  },
  'Barbell strategy': {
    examples:
      'Keep most resources safe while making a few bounded, high-upside bets',
  },
  Optionality: {
    examples:
      'Prefer choices that preserve future paths and limit irreversible commitments',
  },
  'Reversible decisions first': {
    examples:
      'Move quickly on decisions that are cheap to undo; slow down on one-way doors',
  },
  'Expected value': {
    examples:
      'Evaluate choices by probability times impact, not by the most vivid outcome',
  },
  'Base-rate thinking': {
    examples:
      'Start with how similar situations usually turn out before trusting a special story',
  },
  'Bayesian updating': {
    examples:
      'Revise confidence as new evidence arrives instead of defending the first belief',
  },
  Calibration: {
    examples:
      'Track predictions against outcomes to learn how reliable your confidence is',
  },
  Falsifiability: {
    examples:
      'State what evidence would prove you wrong before you become attached to a claim',
  },
  'Steelman the opposition': {
    examples:
      'Present the strongest version of the opposing view before criticizing it',
  },
  'Disconfirming evidence': {
    examples:
      'Actively look for facts that could invalidate your preferred explanation',
  },
  'Map is not the territory': {
    examples:
      'Models simplify reality; test them against what is actually happening',
  },
  'Goodhart’s law': {
    examples:
      'When a measure becomes the target, it can stop measuring what matters',
  },
  'Campbell’s law': {
    examples:
      'The more a metric is used for decisions, the more people will distort it',
  },
  'Correlation is not causation': {
    examples:
      'Two things moving together does not prove that one caused the other',
  },
  'Regression to the mean': {
    examples:
      'Extreme results often move closer to average on the next observation',
  },
  'Law of large numbers': {
    examples:
      'Averages become more reliable across many independent observations',
  },
  'Selection bias': {
    examples:
      'Check who or what was excluded before generalizing from a sample',
  },
  'Fundamental attribution error': {
    examples: 'We explain others by character and ourselves by circumstances',
  },
  'Negativity bias': {
    examples:
      'Bad news and criticism grab more attention than equivalent positives',
  },
  'Planning fallacy': {
    examples:
      'Estimate using comparable completed work, not only your optimistic plan',
  },
  'Hindsight bias': {
    examples: 'After an outcome, avoid pretending it was obvious all along',
  },
  'Curse of knowledge': {
    examples:
      'Once you know something, remember that a beginner does not share your context',
  },
  'IKEA effect': {
    examples: 'We overvalue things we helped create, so seek outside judgment',
  },
  'Mere exposure effect': {
    examples:
      'Familiarity can feel like quality; distinguish repetition from merit',
  },
  'Framing effect': {
    examples:
      'Different wording changes decisions even when the facts stay identical',
  },
  'Contrast effect': {
    examples: 'Judgment shifts relative to what came immediately before',
  },
  'Decoy effect': {
    examples:
      'An inferior third option can manipulate which of two options feels best',
  },
  'Recency bias': {
    examples:
      'Recent events feel more representative than the full historical record',
  },
  'Reciprocal altruism': {
    examples:
      'Help reliably and fairly when relationships will continue over time',
  },
  'Psychological safety': {
    examples: 'Make it safe to ask, admit mistakes, and challenge ideas early',
  },
  'Radical candor': {
    examples: 'Care personally while challenging directly and specifically',
  },
  'Nonviolent communication': {
    examples:
      'Separate observations, feelings, needs, and requests instead of accusations',
  },
  'Active listening': {
    examples: 'Reflect what you heard before preparing your response',
  },
  'Assume positive intent': {
    examples:
      'Begin with charitable interpretations while still verifying facts',
  },
  'Clear is kind': {
    examples: 'Specific expectations and feedback prevent avoidable confusion',
  },
  'Disagree and commit': {
    examples:
      'After a good-faith decision, support the chosen direction rather than relitigating it',
  },
  'Separate people from problems': {
    examples:
      'Treat the issue as shared while preserving the other person’s dignity',
  },
  'Interests over positions': {
    examples:
      'Ask what need a demand serves, then search for more ways to meet it',
  },
  'BATNA (Best Alternative to a Negotiated Agreement)': {
    examples:
      'Know your best alternative before negotiating so you recognize a bad deal',
  },
  'Smallest viable experiment': {
    examples:
      'Test the riskiest assumption with the least time, money, and complexity',
  },
  'Build-measure-learn': {
    examples:
      'Ship a focused test, observe behavior, and adjust using evidence',
  },
  'Customer discovery': {
    examples:
      'Study real problems and behavior before treating a solution as validated',
  },
  'Jobs to be done': {
    examples: 'Understand the progress people hire a product or tool to make',
  },
  'Working backward': {
    examples:
      'Describe the desired customer outcome first, then derive the work needed',
  },
  'Theory of constraints': {
    examples:
      'Improve the limiting bottleneck before optimizing non-constraining parts',
  },
  'Little’s law': {
    examples:
      'More work in progress usually means longer cycle time; limit WIP',
  },
  'Kanban pull system': {
    examples:
      'Start new work only when capacity opens instead of continuously pushing more in',
  },
  'Single-piece flow': {
    examples:
      'Finish a small unit end to end before starting another when feasible',
  },
  'Definition of done': {
    examples: 'Agree on observable completion criteria before work begins',
  },
  'Make work visible': {
    examples:
      'Expose queues, ownership, and blockers so the system can improve',
  },
  'Error budgets': {
    examples:
      'Balance reliability and speed by defining how much failure is acceptable',
  },
  'Blameless postmortems': {
    examples:
      'Investigate system conditions and learning opportunities, not scapegoats',
  },
  'Defense in depth': {
    examples: 'Use multiple safeguards because any single control can fail',
  },
  'Principle of least privilege': {
    examples: 'Give people and systems only the access they need for the task',
  },
  'Make the safe path easy': {
    examples:
      'Design defaults and tools so the secure, reliable choice is the convenient one',
  },
  'Reversibility through versioning': {
    examples:
      'Keep history and rollback paths so experimentation does not become destruction',
  },
  'Two-way door decisions': {
    examples:
      'Classify decisions by reversibility to match deliberation to risk',
  },
  'Opportunity solution tree': {
    examples:
      'Connect desired outcomes to opportunities, solutions, and small tests',
  },
  Essentialism: {
    examples:
      'Do fewer things better by protecting the vital few from the trivial many',
  },
  'Strategic subtraction': {
    examples:
      'Improve a system by removing unnecessary steps, features, and obligations',
  },
  'Hell yes or no': {
    examples:
      'Use a high bar for commitments when time and attention are scarce',
  },
  'Energy management': {
    examples:
      'Plan demanding work around your actual physical and mental energy',
  },
  'Ultradian rhythm': {
    examples:
      'Alternate concentrated effort with restoration before attention collapses',
  },
  'Sleep as performance infrastructure': {
    examples: 'Protect sleep because memory, mood, and judgment depend on it',
  },
  'Exercise for cognition': {
    examples:
      'Regular movement supports focus, stress regulation, and long-term health',
  },
  'Recovery is training': {
    examples:
      'Rest is a planned part of sustainable performance, not a reward for burnout',
  },
  'Minimum viable habit': {
    examples:
      'Make the first version so small that starting is almost impossible to resist',
  },
  'Never miss twice': {
    examples:
      'A lapse is normal; return to the habit on the next available opportunity',
  },
  'Habit tracking': {
    examples: 'Record repetitions to make progress visible and gaps actionable',
  },
  'Fresh start effect': {
    examples:
      'Use new weeks, months, and transitions as deliberate moments to restart',
  },
  'Behavioral activation': {
    examples:
      'Take a small meaningful action first; motivation often follows movement',
  },
  'Exposure over avoidance': {
    examples:
      'Approach manageable feared situations gradually so avoidance loses its grip',
  },
  'Name the emotion': {
    examples: 'Labeling a feeling creates enough distance to choose a response',
  },
  'Response flexibility': {
    examples:
      'Create a pause between trigger and action so you can choose deliberately',
  },
  'Self-compassion': {
    examples:
      'Respond to setbacks with accountability and humane support, not self-contempt',
  },
  'Process praise': {
    examples:
      'Praise strategies, effort, and learning rather than innate talent alone',
  },
  'Desirable difficulty': {
    examples:
      'Use effortful learning conditions that strengthen retention without overwhelming you',
  },
  Interleaving: {
    examples:
      'Mix related skills or problem types to improve discrimination and transfer',
  },
  Elaboration: {
    examples:
      'Ask how and why new information connects to what you already know',
  },
  'Dual coding': {
    examples: 'Combine concise words with meaningful visuals to improve recall',
  },
  'Teach-back': {
    examples:
      'Explain a concept from memory to reveal gaps and consolidate understanding',
  },
  'Retrieval practice': {
    examples:
      'Practice bringing knowledge to mind instead of only reviewing it',
  },
  'Errorful learning': {
    examples:
      'Attempt an answer before seeing it; corrected mistakes make learning stick',
  },
  'Beginner’s mind': {
    examples:
      'Meet familiar problems with curiosity instead of assuming you already know',
  },
  'Shoshin questions': {
    examples:
      'Ask basic questions early; they often uncover the assumptions experts overlook',
  },
  'First draft thinking': {
    examples:
      'Externalize an imperfect version early so it can be improved by reality',
  },
  'Feedback loops': {
    examples: 'Shorten the time between action, signal, and adjustment',
  },
  'Leading indicators': {
    examples:
      'Track behaviors that influence future results, not only lagging outcomes',
  },
  'Lag measures': {
    examples:
      'Use outcome measures to confirm results, while steering with leading measures',
  },
  Scoreboards: {
    examples:
      'Make the few metrics that matter visible, current, and easy to understand',
  },
  'OODA loop': {
    examples:
      'Observe, orient, decide, act — cycle faster while staying grounded in reality',
  },
  'PDCA cycle': {
    examples: 'Plan, do, check, act — learn systematically from each iteration',
  },
  'Double-loop learning': {
    examples:
      'Question the governing assumptions, not just the actions that failed',
  },
  'Five whys': {
    examples:
      'Ask why repeatedly to find a root cause rather than stopping at a symptom',
  },
  'Root cause analysis': {
    examples: 'Trace a failure to contributing conditions that can be changed',
  },
  'Precommit to review': {
    examples:
      'Schedule a decision review before outcomes create hindsight and defensiveness',
  },
  'Decision journal': {
    examples:
      'Record reasoning, assumptions, and confidence before you know the result',
  },
  'Kill criteria': {
    examples:
      'Set conditions for stopping a project before sunk costs bias the decision',
  },
  'Red team review': {
    examples:
      'Assign someone to challenge a plan so weak assumptions surface before launch',
  },
  'Pre-registration of bets': {
    examples:
      'Specify what success means in advance to reduce motivated reinterpretation',
  },
  'Skin in the game': {
    examples:
      'Give decision-makers meaningful exposure to the consequences of their choices',
  },
  'Principal-agent problem': {
    examples:
      'Check whether incentives reward the person acting for outcomes you actually want',
  },
  'Incentives matter': {
    examples: 'People adapt to what is rewarded, measured, and made easy',
  },
  'Tragedy of the commons': {
    examples:
      'Shared resources need clear stewardship or individual incentives can deplete them',
  },
  'Network effects': {
    examples:
      'A product can become more useful as more compatible participants join',
  },
  'Switching costs': {
    examples:
      'Account for the time, risk, and habit change required to adopt an alternative',
  },
  'Power laws': {
    examples:
      'A few causes or opportunities can dominate results, so look for asymmetry',
  },
  Leverage: {
    examples:
      'Use tools, code, media, and systems to multiply the effect of good judgment',
  },
  'Comparative advantage': {
    examples:
      'Focus on work where your relative strength creates the most joint value',
  },
  'Division of labor': {
    examples:
      'Specialization can raise quality when coordination costs remain manageable',
  },
  'Make or buy': {
    examples:
      'Build only when control or differentiation outweighs acquisition and maintenance cost',
  },
  'Long-term orientation': {
    examples:
      'Choose actions that remain sensible when viewed across years, not just this week',
  },
  'Finite and infinite games': {
    examples:
      'Optimize to keep playing and improving the game, not merely to win one round',
  },
  'Cathedral thinking': {
    examples:
      'Make present choices worthy of a long horizon, even when results arrive slowly',
  },
  'Legacy test': {
    examples:
      'Ask whether you would be proud to explain this decision to people you respect',
  },
  'Reputation compound interest': {
    examples:
      'Repeated reliability creates trust that makes future cooperation easier',
  },
  'Trust battery': {
    examples:
      'Small kept promises charge trust; broken promises drain it quickly',
  },
  'Credibility through specificity': {
    examples:
      'Make clear commitments with owners and dates instead of vague assurances',
  },
  'Default to transparency': {
    examples:
      'Share relevant context unless there is a concrete reason to restrict it',
  },
  'Write it down': {
    examples:
      'Written reasoning exposes ambiguity and creates a durable shared reference',
  },
  'Narrative clarity': {
    examples:
      'Explain change as a coherent problem, insight, choice, and expected outcome',
  },
  'Pyramid principle': {
    examples:
      'Lead with the answer, then organize supporting points beneath it',
  },
  'One-sentence strategy': {
    examples:
      'State the chosen advantage and focus in language people can remember',
  },
  'Working agreements': {
    examples:
      'Make team norms explicit so coordination does not rely on mind reading',
  },
  RACI: {
    examples:
      'Clarify who is responsible, accountable, consulted, and informed',
  },
  'DRI ownership': {
    examples:
      'Give every important outcome one directly responsible individual',
  },
  'Delegation by outcomes': {
    examples:
      'Define the result, constraints, and authority; avoid prescribing every move',
  },
  'Context, not control': {
    examples:
      'Give people the information needed to make good decisions close to the work',
  },
  'Ladder of inference': {
    examples:
      'Distinguish observed data from the story and conclusions you built on it',
  },
  'SCARF model': {
    examples:
      'Status, certainty, autonomy, relatedness, and fairness shape social reactions',
  },
  'Pygmalion effect': {
    examples:
      'High, credible expectations can improve performance through changed support and effort',
  },
  'Tactical empathy': {
    examples:
      'Show that you understand another perspective without surrendering your own interests',
  },
  Mirroring: {
    examples:
      'Repeat a key phrase with curiosity to invite the other person to elaborate',
  },
  'Labeling in negotiation': {
    examples:
      'Name the emotion or concern you hear to reduce defensiveness and reveal information',
  },
  'Ask calibrated questions': {
    examples:
      'Use how and what questions that help others solve the problem with you',
  },
  'Zone of proximal development': {
    examples:
      'Choose challenges just beyond current ability with enough support to learn',
  },
  Scaffolding: {
    examples: 'Provide temporary structure, then remove it as capability grows',
  },
  'Mastery orientation': {
    examples:
      'Measure improvement and understanding, not only rank or appearance',
  },
  'Autonomy support': {
    examples:
      'Offer meaningful choice and rationale rather than relying only on pressure',
  },
  'Purpose alignment': {
    examples:
      'Connect routine work to the people or outcomes it is meant to serve',
  },
  'Ikigai reflection': {
    examples:
      'Look for the overlap of what matters to you, what you can do, and what helps others',
  },
  'Values-based action': {
    examples:
      'Choose behavior that expresses your values even when feelings are inconvenient',
  },
  'Eudaimonic wellbeing': {
    examples:
      'Build a good life through meaning, virtue, growth, and contribution',
  },
  'Hedonic adaptation': {
    examples:
      'New gains quickly feel normal, so invest in relationships and practices that renew appreciation',
  },
  Savoring: {
    examples:
      'Slow down to notice and extend positive experiences instead of rushing past them',
  },
  'Broaden-and-build': {
    examples:
      'Positive emotions widen attention and help build lasting social and cognitive resources',
  },
  'Hope theory': {
    examples:
      'Sustain motivation by pairing a valued goal with workable routes and agency',
  },
  'Learned optimism': {
    examples:
      'Explain setbacks as specific, temporary, and changeable when evidence allows',
  },
  'Antifragile mindset': {
    examples:
      'Use setbacks as information for adaptation while avoiding needless fragility',
  },
  'Stress inoculation': {
    examples:
      'Practice under gradually harder conditions before high-stakes performance',
  },
  'Cognitive load management': {
    examples:
      'Reduce unnecessary complexity so working memory can focus on the real task',
  },
  Chunking: {
    examples:
      'Group related information into meaningful units that are easier to hold and use',
  },
  'External brain': {
    examples:
      'Use trusted notes and systems to offload reminders, references, and open loops',
  },
  'Progressive summarization': {
    examples:
      'Distill notes in layers so the most useful ideas become easier to revisit',
  },
  'Commonplace book': {
    examples:
      'Collect ideas worth revisiting and connect them to your own work over time',
  },
  'Zettelkasten linking': {
    examples:
      'Create small linked notes so insights can recombine into new thinking',
  },
  'Serendipity by exposure': {
    examples:
      'Increase useful accidents by meeting diverse people and sharing unfinished ideas',
  },
  'Adjacent possible': {
    examples:
      'Explore the next feasible step opened by current capabilities, not only distant leaps',
  },
  'Diverge then converge': {
    examples:
      'Generate many possibilities before narrowing deliberately with clear criteria',
  },
  'Constraints breed creativity': {
    examples:
      'Use clear limits to focus invention and prevent endless option searching',
  },
  'Lateral thinking': {
    examples:
      'Change perspective, assumptions, or framing to find non-obvious solutions',
  },
  'Design for the edge case': {
    examples:
      'Study difficult cases because they reveal hidden assumptions in the normal path',
  },
  'Accessibility by default': {
    examples:
      'Design for diverse needs from the start; clarity and flexibility help everyone',
  },
  'Universal design': {
    examples:
      'Make environments and tools usable by the widest range of people without special adaptation',
  },
  'Reduce shame, increase agency': {
    examples:
      'Frame problems around controllable next steps instead of personal deficiency',
  },
  'Dignity in disagreement': {
    examples:
      'Challenge ideas firmly while refusing contempt for the person holding them',
  },
  'Charity principle': {
    examples:
      'Interpret another view in its most reasonable form before responding',
  },
  'Epistemic humility': {
    examples:
      'Hold beliefs with confidence proportional to evidence and remain ready to revise',
  },
  'Strong opinions, loosely held': {
    examples:
      'Commit enough to act, but update quickly when better evidence appears',
  },
  'Explore-exploit balance': {
    examples:
      'Use proven approaches while reserving capacity to test promising alternatives',
  },
  'Portfolio of experiments': {
    examples:
      'Run several small, independent bets instead of depending on one grand prediction',
  },
  'Asymmetric upside': {
    examples:
      'Favor opportunities where potential gains greatly exceed the limited downside',
  },
  'Via negativa': {
    examples:
      'Improve by removing harmful habits, needless complexity, and predictable sources of error',
  },
  'Lindy effect': {
    examples:
      'For non-perishable ideas, long survival can suggest a longer remaining life',
  },
  'Shirky principle': {
    examples:
      'Institutions often preserve the problem they are organized to solve',
  },
  'Conway’s law': {
    examples:
      'System designs tend to mirror the communication structure of the people who build them',
  },
  'Parkinson’s triviality': {
    examples:
      'Groups can spend disproportionate time on easy, low-stakes details',
  },
  'Law of two feet': {
    examples:
      'Leave conversations where you cannot learn or contribute, then find a better use of attention',
  },
  'Meeting hygiene': {
    examples:
      'Use a purpose, agenda, preparation, decisions, and owners—or do not meet',
  },
  'Async by default': {
    examples:
      'Use written, time-shifted communication when real-time discussion is not necessary',
  },
  'Maker-manager schedule': {
    examples:
      'Protect long uninterrupted blocks for creative work from fragmented meeting time',
  },
  'Attention residue': {
    examples:
      'Switching tasks leaves part of attention behind; finish or park work deliberately',
  },
  Monotasking: {
    examples:
      'Give one cognitively demanding task your full attention for a defined interval',
  },
  'Deep work': {
    examples:
      'Protect distraction-free time for work that requires sustained concentration',
  },
  'Shallow work boundaries': {
    examples:
      'Contain reactive administration so it does not consume the time needed for important creation',
  },
  'Inbox zero as triage': {
    examples:
      'Process incoming items to a trusted next action, reference, delegate, or delete decision',
  },
  'Weekly review': {
    examples:
      'Regularly reset priorities, commitments, and systems before drift becomes expensive',
  },
  'Monthly retrospective': {
    examples:
      'Review patterns, not just events, to choose one or two improvements for the next month',
  },
  'Personal board of directors': {
    examples:
      'Seek candid perspectives from people with different experience and incentives',
  },
  'Mentors and sponsors': {
    examples:
      'Learn from mentors and seek sponsors who will advocate when opportunities arise',
  },
  'Give credit generously': {
    examples:
      'Name others’ contributions accurately; shared wins strengthen trust and collaboration',
  },
  'Do the next right thing': {
    examples:
      'When the whole path is unclear, take the smallest ethical and useful next action',
  },
  'Start before ready': {
    examples:
      'Begin with a bounded draft or experiment; readiness grows through action',
  },
  'Finish lines matter': {
    examples:
      'Define a stopping point so useful work reaches the people it is meant to help',
  },
  'Ship, then improve': {
    examples:
      'Deliver a sound version, learn from use, and iterate rather than polishing in isolation',
  },
  Craftsmanship: {
    examples:
      'Care about quality in the details because repeated standards shape trust and pride',
  },
  'Professionalism under pressure': {
    examples:
      'Keep commitments, communicate early, and preserve respect when circumstances get hard',
  },
};
