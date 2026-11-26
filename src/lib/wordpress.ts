import crypto from 'node:crypto';

/**
 * Client for the TM Meeting Tools WordPress plugin. Every plugin action is a WordPress ability, run
 * over REST with an application password of a WordPress admin.
 */

export interface WpAgendaItem {
  id: number;
  position: number;
  role_type_id: number;
  role_name: string;
  label: string;
  category: string;
  person_name: string;
  speech_title: string;
  red_sec: number;
  is_adhoc: boolean;
}

export interface WpMeeting {
  id: number;
  /** YYYY-MM-DD, site time. */
  date: string;
  /** HH:MM, site time. */
  time: string;
  theme: string;
  word_of_day: string;
  status: 'planned' | 'in_progress' | 'completed';
  agenda?: WpAgendaItem[];
}

export interface WpRoleType {
  id: number;
  name: string;
  category: string;
}

export interface WpMember {
  id: number;
  name: string;
  /** The tmclub.eu (easy-Speak) user id. */
  tm_id: string;
  last_synced_at: string | null;
}

export interface WpFeedback {
  id: number;
  meeting_id: number;
  agenda_item_id: number | null;
  person_name: string;
  kind: 'audience' | 'evaluation' | 'general';
  giver_name: string;
  about: string;
  went_well: string;
  potential: string;
  body: string;
}

type Method = 'GET' | 'POST' | 'DELETE';

export const wpConfigured = () => Boolean(process.env.WP_URL && process.env.WP_USER && process.env.WP_APP_PASSWORD);

/** InfinityFree's "testcookie" anti-bot check; solved once and reused until it stops working. */
let testCookie: string | undefined;

/**
 * Free hosts like InfinityFree answer every non-browser request with a small page that sets the
 * cookie `__test` from an AES-128-CBC decryption (key a, iv b, data c) and reloads. We do the same
 * decryption here so the worker gets through without a browser.
 */
function solveTestCookie(html: string) {
  const [a, b, c] = [...html.matchAll(/toNumbers\("([0-9a-f]+)"\)/g)].map((m) => Buffer.from(m[1], 'hex'));
  if (!a || !b || !c) return undefined;
  const d = crypto.createDecipheriv('aes-128-cbc', a, b).setAutoPadding(false);
  return Buffer.concat([d.update(c), d.final()]).toString('hex');
}

async function call<T>(name: string, method: Method, input: Record<string, unknown> = {}): Promise<T> {
  const base = process.env.WP_URL!.replace(/\/$/, '');
  let url = `${base}/wp-json/wp-abilities/v1/abilities/tm-meeting-tools/${name}/run`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64')}`,
      Accept: 'application/json',
    },
    redirect: 'manual',
  };
  if (method === 'POST') {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify({ input });
  } else {
    // Read and delete abilities take their input as query parameters: input[key]=value.
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v != null) qs.set(`input[${k}]`, String(v));
    if ([...qs].length) url += `?${qs}`;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (testCookie) (init.headers as Record<string, string>).Cookie = `__test=${testCookie}`;
    const res = await fetch(url, init);
    const text = await res.text();
    if (text.includes('/aes.js')) {
      testCookie = solveTestCookie(text);
      if (!testCookie) throw new Error('WordPress host shows a bot check that could not be solved');
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`WordPress ${name}: HTTP ${res.status}, not JSON: ${text.slice(0, 120)}`);
    }
    if (!res.ok) {
      const msg = (json as { message?: string })?.message ?? text.slice(0, 200);
      throw new Error(`WordPress ${name}: HTTP ${res.status} ${msg}`);
    }
    return json as T;
  }
  throw new Error('WordPress host keeps showing its bot check');
}

export const wp = {
  listMeetings: (when: 'upcoming' | 'past' | 'all' = 'all', limit = 50) =>
    call<{ meetings: WpMeeting[] }>('list-meetings', 'GET', { when, limit }).then((r) => r.meetings),
  getMeeting: (meetingId: number) => call<WpMeeting>('get-meeting', 'GET', { meeting_id: meetingId }),
  createMeeting: (input: { date: string; time: string; template: 'standard' | 'empty' }) => call<WpMeeting>('create-meeting', 'POST', input),
  updateMeeting: (meetingId: number, input: Partial<Pick<WpMeeting, 'date' | 'time' | 'theme' | 'word_of_day'>>) =>
    call<WpMeeting>('update-meeting', 'POST', { meeting_id: meetingId, ...input }),
  addAgendaItem: (meetingId: number, input: { role_type_id: number; person_name?: string; speech_title?: string; after_item_id?: number }) =>
    call<WpAgendaItem>('add-agenda-item', 'POST', { meeting_id: meetingId, ...input }),
  updateAgendaItem: (itemId: number, input: { person_name?: string; speech_title?: string }) =>
    call<WpAgendaItem>('update-agenda-item', 'POST', { item_id: itemId, ...input }),
  listRoleTypes: () => call<{ role_types: WpRoleType[] }>('list-role-types', 'GET').then((r) => r.role_types),
  syncMembers: (members: { tm_id: string; name: string }[]) =>
    call<{ created: number; updated: number; members: WpMember[] }>('sync-members', 'POST', { members }),
  listMembers: () => call<{ members: WpMember[] }>('list-members', 'GET').then((r) => r.members),
  listFeedback: (meetingId: number) => call<{ feedback: WpFeedback[] }>('list-feedback', 'GET', { meeting_id: meetingId }).then((r) => r.feedback),
};
