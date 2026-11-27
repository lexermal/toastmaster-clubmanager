import makeWASocket, {
  Browsers,
  decryptPollVote,
  DisconnectReason,
  isPnUser,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from 'baileys';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import pino from 'pino';
import { DATA_DIR, db, schema } from '../lib/db';
import type { PollSpec } from '../lib/db/schema';
import { getSetting, setSetting } from '../lib/settings';

let sock: WASocket | undefined;
let ready = false;

export type InboundHandler = (phone: string, text: string) => Promise<string | undefined>;
/** `option` is the chosen index, or null when the voter removed their vote. */
export type PollVoteHandler = (phone: string, poll: typeof schema.polls.$inferSelect, option: number | null) => Promise<string | undefined>;

export const isWhatsAppReady = () => ready;

/** Connects the club's WhatsApp number. The pairing QR is stored in settings for the admin page. */
export async function startWhatsApp(onMessage: InboundHandler, onPollVote: PollVoteHandler) {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(DATA_DIR, 'whatsapp-auth'));
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'warn' }) as never,
    browser: Browsers.appropriate('Club Manager'),
    markOnlineOnConnect: false,
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      setSetting('wa_qr', qr);
      setSetting('wa_status', 'waiting-for-scan');
    }
    if (connection === 'open') {
      ready = true;
      setSetting('wa_qr', null);
      setSetting('wa_status', 'connected');
      setSetting('wa_me', sock?.user?.id ?? null);
      await refreshGroups();
    }
    if (connection === 'close') {
      ready = false;
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        setSetting('wa_status', 'logged-out');
        console.error('[whatsapp] logged out — delete data/whatsapp-auth and restart to pair again');
        return;
      }
      setSetting('wa_status', 'reconnecting');
      setTimeout(() => startWhatsApp(onMessage, onPollVote).catch((e) => console.error('[whatsapp] restart failed', e)), 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      try {
        if (msg.message?.pollUpdateMessage) {
          await handlePollVote(msg, onPollVote);
          continue;
        }
        const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
        if (msg.key.remoteJid?.endsWith('@g.us') || !text) continue; // group chatter is not a command
        const phone = await phoneOf(msg.key.remoteJid, msg.key.remoteJidAlt);
        if (!phone) continue;
        const reply = await onMessage(phone, text.trim());
        if (reply) await sock?.sendMessage(msg.key.remoteJid!, { text: reply });
      } catch (e) {
        console.error('[whatsapp] handler failed', e);
      }
    }
  });
}

/**
 * Phone number for a set of JIDs. WhatsApp increasingly addresses people by an opaque "@lid" id;
 * Baileys v7 puts the phone-number JID in the *Alt fields, or we look it up in its LID mapping.
 */
async function phoneOf(...jids: (string | null | undefined)[]) {
  const pn = jids.find((j) => isPnUser(j ?? undefined));
  if (pn) return jidNormalizedUser(pn).split('@')[0];
  const lid = jids.find((j) => j?.endsWith('@lid'));
  const mapped = lid ? await sock?.signalRepository.lidMapping.getPNForLID(lid) : null;
  return mapped ? jidNormalizedUser(mapped).split('@')[0] : undefined;
}

/**
 * Baileys v7 no longer decrypts poll votes itself. The vote key is derived from the poll creator's
 * and voter's JIDs exactly as the voter's phone saw them — phone-number or LID form depending on the
 * group — so try every combination.
 */
async function handlePollVote(msg: WAMessage, onPollVote: PollVoteHandler) {
  const update = msg.message!.pollUpdateMessage!;
  const pollMsgId = update.pollCreationMessageKey?.id;
  if (!pollMsgId || !update.vote) return;
  const poll = db.select().from(schema.polls).where(eq(schema.polls.waMessageId, pollMsgId)).get();
  if (!poll) return;

  const me = sock!.user!;
  const creators = [me.id, me.lid].filter(Boolean).map((j) => jidNormalizedUser(j!));
  const k = msg.key;
  const voters = [k.participant, k.participantAlt, k.remoteJid, k.remoteJidAlt]
    .filter((j): j is string => !!j && !j.endsWith('@g.us'))
    .map((j) => jidNormalizedUser(j));

  let selected: Uint8Array[] | undefined;
  for (const pollCreatorJid of creators) {
    for (const voterJid of voters) {
      try {
        const vote = decryptPollVote(update.vote, { pollCreatorJid, pollMsgId, pollEncKey: Buffer.from(poll.secret, 'base64'), voterJid });
        selected = vote.selectedOptions ?? [];
        break;
      } catch {
        // wrong JID combination — try the next
      }
    }
    if (selected) break;
  }
  if (!selected) return console.warn('[whatsapp] could not decrypt poll vote', pollMsgId);

  // Votes carry SHA-256 hashes of the option text, not indexes.
  const hashes = poll.spec.options.map((o) => createHash('sha256').update(o.label).digest('hex'));
  const chosen = selected.length ? hashes.indexOf(Buffer.from(selected[0]).toString('hex')) : null;
  const phone = await phoneOf(...voters);
  if (!phone) return;
  const reply = await onPollVote(phone, poll, chosen === -1 ? null : chosen);
  if (reply) await sock!.sendMessage(`${phone}@s.whatsapp.net`, { text: reply });
}

export async function refreshGroups() {
  if (!sock || !ready) return;
  const groups = await sock.groupFetchAllParticipating();
  setSetting('wa_groups', JSON.stringify(Object.values(groups).map((g) => ({ jid: g.id, subject: g.subject }))));
}

/** `to` is "group" (the configured club group) or a phone number in digits. */
export async function sendWhatsApp(msg: { to: string; body: string; mentions?: string[] | null; poll?: PollSpec | null; meetingId?: number | null }) {
  if (!sock || !ready) throw new Error('WhatsApp not connected');
  const jid = msg.to === 'group' ? getSetting('wa_group_jid') : `${msg.to}@s.whatsapp.net`;
  if (!jid) throw new Error('No club group selected in admin');

  if (msg.poll) {
    // We keep the secret: without it incoming votes can't be decrypted.
    const secret = randomBytes(32);
    const sent = await sock.sendMessage(jid, {
      poll: { name: msg.body, values: msg.poll.options.map((o) => o.label), selectableCount: 1, messageSecret: secret },
    });
    if (!sent?.key.id) throw new Error('Poll was not sent');
    db.insert(schema.polls).values({ waMessageId: sent.key.id, meetingId: msg.meetingId ?? null, secret: secret.toString('base64'), spec: msg.poll }).run();
    return;
  }
  await sock.sendMessage(jid, { text: msg.body, mentions: msg.mentions?.map((p) => `${p}@s.whatsapp.net`) });
}
