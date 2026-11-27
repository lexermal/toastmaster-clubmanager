import { and, eq, isNull, lte } from 'drizzle-orm';
import type { TmClubClient } from 'tmclub-api';
import { CLUB } from '../lib/club';
import { db, schema } from '../lib/db';
import { formatMeetingDate } from '../lib/format';
import { setSetting } from '../lib/settings';
import { alert } from '../lib/telegram';
import { wp, type WpAgendaItem, type WpFeedback } from '../lib/wordpress';
import { refreshEnd, shortName } from './wpSync';

type Api = Pick<TmClubClient, 'getMeeting' | 'sendEmail'>;

const MIN = 60_000;
/** Matches the WordPress plugin, which marks the meeting completed at the same moment. */
const AFTER_END = 30 * MIN;
/** Don't start mailing meetings that ended long ago (e.g. right after this feature is deployed). */
const TOO_OLD = 24 * 60 * MIN;
const MAX_ATTEMPTS = 5;

/**
 * Safety switch while this is new: only these easy-Speak user ids get e-mails, everyone else is
 * recorded as skipped. Default: only Alex W. (112036). "*" allows every speaker.
 */
function allowed(tmUserId: string) {
  const list = (process.env.FEEDBACK_EMAIL_ALLOWED_TM_IDS ?? '112036').split(',').map((s) => s.trim()).filter(Boolean);
  // The alpha test must never e-mail everyone, even if the allow list is misconfigured.
  if (process.env.WORKER_MODE === 'wordpress-only') return list.includes(tmUserId);
  return list.includes('*') || list.includes(tmUserId);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const para = (s: string) => esc(s.trim()).replace(/\n/g, '<br>');

export function feedbackEmailHtml(item: WpAgendaItem, notes: WpFeedback[], date: string) {
  const evaluations = notes.filter((n) => n.kind === 'evaluation');
  const audience = notes.filter((n) => n.kind === 'audience');
  const speech = item.speech_title ? ` “${esc(item.speech_title)}”` : '';
  const html = [`<p>Hi ${esc(item.person_name.split(' ')[0])},</p>`, `<p>Thank you for your speech${speech} at ${esc(CLUB.name)} on ${esc(date)}! Here is the written feedback you got.</p>`];
  for (const e of evaluations) {
    html.push(`<h3>Evaluation${e.giver_name ? ` by ${esc(e.giver_name)}` : ''}</h3>`);
    if (e.went_well.trim()) html.push(`<p><strong>What you did great:</strong><br>${para(e.went_well)}</p>`);
    if (e.potential.trim()) html.push(`<p><strong>Where you have potential:</strong><br>${para(e.potential)}</p>`);
    if (e.body.trim()) html.push(`<p>${para(e.body)}</p>`);
  }
  if (audience.length) {
    html.push(`<h3>From the audience (${audience.length} anonymous note${audience.length === 1 ? '' : 's'})</h3>`);
    const great = audience.map((n) => n.went_well).filter((s) => s.trim());
    const potential = audience.map((n) => n.potential).filter((s) => s.trim());
    if (great.length) html.push(`<p><strong>What you did great:</strong></p><ul>${great.map((s) => `<li>${para(s)}</li>`).join('')}</ul>`);
    if (potential.length) html.push(`<p><strong>Where you have potential:</strong></p><ul>${potential.map((s) => `<li>${para(s)}</li>`).join('')}</ul>`);
  }
  html.push('<p>The club deletes this feedback from the website 7 days after the meeting, so keep this e-mail if you want it.</p>');
  return html.join('\n');
}

/**
 * 30 minutes after a meeting's planned end (start plus all agenda times), e-mail every speaker the
 * feedback written for their speech, through easy-Speak. At most one e-mail per call: easy-Speak
 * refuses e-mails sent in quick succession ("To prevent spam..."), and the worker calls this every 20 s.
 */
export async function sendFeedbackEmails(api: Api, now = Date.now()) {
  const due = db
    .select()
    .from(schema.wpMeetings)
    .where(and(isNull(schema.wpMeetings.feedbackDoneAt), lte(schema.wpMeetings.endsAt, new Date(now - AFTER_END))))
    .all();
  for (const row of due) {
    if (now - row.endsAt.getTime() > TOO_OLD + AFTER_END) {
      db.update(schema.wpMeetings).set({ feedbackDoneAt: new Date(now) }).where(eq(schema.wpMeetings.id, row.id)).run();
      continue;
    }
    // Table topics added on the day make the meeting longer: wait for the real end.
    const { meeting, endsAt } = await refreshEnd(row);
    if (endsAt.getTime() + AFTER_END > now) continue;

    const speeches = (meeting.agenda ?? []).filter((i) => i.category === 'speech' && i.person_name.trim());
    const pending = speeches.filter((item) => {
      const done = db
        .select()
        .from(schema.feedbackEmails)
        .where(and(eq(schema.feedbackEmails.wpMeetingId, meeting.id), eq(schema.feedbackEmails.agendaItemId, item.id)))
        .get();
      return !done || done.status === 'pending';
    });
    if (!pending.length) {
      db.update(schema.wpMeetings).set({ feedbackDoneAt: new Date(now) }).where(eq(schema.wpMeetings.id, row.id)).run();
      continue;
    }

    const feedback = await wp.listFeedback(meeting.id);
    // The agenda only has "First L."; the full easy-Speak roster tells us whose speech it was.
    const tm = await api.getMeeting(row.tmMeetingId);
    const members = await wp.listMembers();
    const date = formatMeetingDate(row.startsAt, { weekday: undefined });

    for (const item of pending) {
      const notes = feedback.filter(
        (f) => (f.kind === 'audience' || f.kind === 'evaluation') && (f.agenda_item_id === item.id || (!f.agenda_item_id && f.person_name === item.person_name)),
      );
      const tmUserId =
        tm.roles.find((r) => r.presenter && shortName(r.presenter.name) === item.person_name)?.presenter?.userId ??
        members.find((m) => m.name === item.person_name && m.tm_id)?.tm_id;

      const base = { wpMeetingId: meeting.id, agendaItemId: item.id, personName: item.person_name, tmUserId: tmUserId ?? null };
      const skip = !tmUserId ? 'no easy-Speak account found' : !notes.length ? 'no written feedback' : !allowed(tmUserId) ? 'not on the allow list' : null;
      if (skip) {
        save({ ...base, status: 'skipped', detail: skip });
        continue;
      }

      const existing = find(meeting.id, item.id);
      try {
        await api.sendEmail(tmUserId!, {
          subject: `Your speech feedback from ${CLUB.name}, ${date}`,
          message: feedbackEmailHtml(item, notes, date),
          copyToSelf: false,
        });
        save({ ...base, status: 'sent', detail: null, attempts: (existing?.attempts ?? 0) + 1 });
        setSetting('wp_feedback_error', null);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const attempts = (existing?.attempts ?? 0) + 1;
        save({ ...base, status: attempts >= MAX_ATTEMPTS ? 'error' : 'pending', detail, attempts });
        setSetting('wp_feedback_error', `${item.person_name}: ${detail}`);
        void alert(`feedback-email:${meeting.id}:${item.id}`, `feedback e-mail to ${item.person_name} failed (try ${attempts}/${MAX_ATTEMPTS}): ${detail}`, 0);
      }
      // One e-mail per call (see above); the rest go out on the next ticks.
      return;
    }
  }
}

const find = (wpMeetingId: number, agendaItemId: number) =>
  db
    .select()
    .from(schema.feedbackEmails)
    .where(and(eq(schema.feedbackEmails.wpMeetingId, wpMeetingId), eq(schema.feedbackEmails.agendaItemId, agendaItemId)))
    .get();

function save(row: typeof schema.feedbackEmails.$inferInsert) {
  db.insert(schema.feedbackEmails)
    .values(row)
    .onConflictDoUpdate({ target: [schema.feedbackEmails.wpMeetingId, schema.feedbackEmails.agendaItemId], set: row })
    .run();
}
