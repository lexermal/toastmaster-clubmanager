/** Role guides (linked from WhatsApp reminders) and timing helpers for recaps. */

export interface RoleGuide {
  slug: string;
  name: string;
  /** Matches the role name easy-Speak uses. */
  match: RegExp;
  /** Position in the suggested learning path; lower = easier first role. */
  level: number;
  summary: string;
  before: string[];
  during: string[];
  tips: string[];
  /** Days before the meeting the role reminder goes out. */
  remindDaysBefore: number;
}

export const ROLE_GUIDES: RoleGuide[] = [
  {
    slug: 'timekeeper',
    name: 'Timekeeper',
    match: /time ?keeper|timer/i,
    level: 1,
    summary: 'You keep the meeting on schedule and show each speaker green, amber and red signals.',
    before: [
      'Check the agenda for each speech’s green / amber / red times.',
      'Open the timer on the club’s meeting page on your phone.',
    ],
    during: [
      'Explain the timing signals briefly when the Toastmaster introduces you.',
      'Open the timer, pick the speaker and the timing type, start when they start speaking.',
      'Hold up the phone so the speaker sees the full-screen colour.',
      'Give a short timing report at the end; times are saved automatically.',
    ],
    tips: [
      'Start the clock at the first word or gesture, not when they walk up.',
      'Forgot to start? Use +10 s / +30 s to correct it.',
    ],
    remindDaysBefore: 2,
  },
  {
    slug: 'ah-counter',
    name: 'Ah-Counter',
    match: /ah.?counter/i,
    level: 2,
    summary: 'You listen for filler words (ah, um, so, like…) and report them kindly to help speakers improve.',
    before: ['Open the Ah-Counter on the club’s meeting page on your phone.'],
    during: [
      'Explain your role in one or two sentences when introduced.',
      'Tap the counter for each filler word per speaker.',
      'Report the totals at the end — counts are sent to each speaker afterwards.',
    ],
    tips: ['Note repeated words too ("and, and").', 'Keep the report light and encouraging.'],
    remindDaysBefore: 2,
  },
  {
    slug: 'grammarian',
    name: 'Grammarian',
    match: /grammarian/i,
    level: 3,
    summary: 'You introduce the Word of the Day and note great language use and slips.',
    before: [
      'Choose a Word of the Day that is useful but not too common.',
      'Prepare a short definition and an example sentence.',
    ],
    during: [
      'Present the Word of the Day at the start of the meeting.',
      'Note who used it and any memorable phrases.',
      'Give a short report: highlights first, then a few improvements.',
    ],
    tips: ['Celebrate vivid language — it encourages everyone.'],
    remindDaysBefore: 4,
  },
  {
    slug: 'table-topics-master',
    name: 'Table Topics Master',
    match: /table ?topics? ?master/i,
    level: 4,
    summary: 'You run the impromptu speaking session: you ask questions, people answer for 1–2 minutes.',
    before: [
      'Prepare 6–8 open questions, ideally linked to the meeting theme.',
      'Keep them short and easy to understand for non-native speakers.',
    ],
    during: [
      'Explain the rules: 1–2 minutes, timing lights apply.',
      'Call on members first, then offer guests a chance.',
      'Thank each speaker and lead the applause.',
    ],
    tips: ['Ask questions that invite stories, not facts.', 'Don’t reveal the question before you name the speaker.'],
    remindDaysBefore: 5,
  },
  {
    slug: 'evaluator',
    name: 'Evaluator',
    match: /^evaluator|speech evaluator/i,
    level: 5,
    summary: 'You give a speaker a short, helpful evaluation of their prepared speech (2–3 minutes).',
    before: [
      'Contact your speaker: which project, what are their goals, what do they want feedback on?',
      'Read the project’s evaluation criteria in Pathways.',
    ],
    during: [
      'Take notes during the speech.',
      'Deliver a sandwich: what worked, one or two concrete improvements, encouraging close.',
      'Your evaluation is recorded and sent to the speaker with a written summary.',
    ],
    tips: ['Be specific: quote what they said.', 'Focus on 2 improvements, not 10.'],
    remindDaysBefore: 4,
  },
  {
    slug: 'speaker',
    name: 'Speaker',
    match: /^speaker|prepared speech/i,
    level: 6,
    summary: 'You deliver a prepared speech from your Pathways project.',
    before: [
      'Tell your evaluator your project and goals.',
      'Rehearse with a timer — aim for the middle of your time window.',
      'Send the Toastmaster a short introduction for you.',
    ],
    during: [
      'Watch the timing lights: green = minimum reached, amber = wrap up, red = stop.',
      'After your speech the audience gives anonymous written feedback — you get all of it on WhatsApp.',
    ],
    tips: ['Open strong, close strong.', 'Pause instead of using filler words.'],
    remindDaysBefore: 7,
  },
  {
    slug: 'general-evaluator',
    name: 'General Evaluator',
    match: /general evaluator/i,
    level: 7,
    summary: 'You lead the evaluation team and evaluate the meeting as a whole, including the roles.',
    before: [
      'Confirm the evaluators, Timekeeper, Ah-Counter and Grammarian.',
      'Plan what you will look for: flow, timing, energy, role performance.',
    ],
    during: [
      'Introduce the evaluation team.',
      'Call the evaluators and helper roles for their reports.',
      'Give feedback on the roles and the meeting — it is recorded and sent to each role holder.',
    ],
    tips: ['Address each role holder directly by name for better summaries.'],
    remindDaysBefore: 4,
  },
  {
    slug: 'toastmaster',
    name: 'Toastmaster of the Evening',
    match: /toastmaster( of the (evening|day|meeting))?$|^tmod|meeting host/i,
    level: 8,
    summary: 'You host the meeting: open it, introduce every role holder and keep the energy up.',
    before: [
      'Pick or confirm the meeting theme.',
      'Contact all role holders and speakers; collect speech titles and introductions.',
      'Check the agenda timing.',
    ],
    during: [
      'Welcome everyone, especially guests, and explain how the meeting works.',
      'Introduce each segment and role holder, and lead applause.',
      'Keep an eye on the clock and close on time.',
    ],
    tips: ['Smooth transitions make the meeting feel professional.'],
    remindDaysBefore: 7,
  },
];

export function guideForRole(role: string): RoleGuide | undefined {
  return ROLE_GUIDES.find((g) => g.match.test(role.trim()));
}

export function isSpeechRole(role: string) {
  return guideForRole(role)?.slug === 'speaker';
}

/** Toastmasters contests allow 30 s grace either side of the window. */
export const GRACE_SEC = 30;

export function timingVerdict(t: { greenSec: number; redSec: number; durationSec: number }) {
  if (t.durationSec < t.greenSec - GRACE_SEC) return 'under';
  if (t.durationSec > t.redSec + GRACE_SEC) return 'over';
  return 'ok';
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const VOTE_CATEGORIES = [
  { key: 'speaker', label: 'Best Speaker' },
  { key: 'tabletopic', label: 'Best Table Topic' },
  { key: 'evaluator', label: 'Best Evaluator' },
  { key: 'role', label: 'Best Role Taker' },
] as const;
