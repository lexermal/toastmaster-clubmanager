# Club Manager: Malmö Toastmasters

Meeting tools and WhatsApp automation for a Toastmasters club. Members mostly use it through WhatsApp:
they get reminders, sign up for roles, and receive a personal recap after every meeting.

## What lives where

The public, rarely changing content is a **WordPress site** (currently
https://malmo-tm.infinityfreeapp.com, theme Twenty Twenty-Five, built only from core blocks):
home, Visit us, Meeting roles, Membership, About us, Privacy policy, with the social links in the footer.
Edit those pages in WordPress, not here.

This app covers WhatsApp, the sync with tmclub.eu, recaps and admin. Its public pages and the audience
meeting hub (`/m`) were removed: they now live in WordPress (pages, plus the meeting tools plugin in
`../toastmaster-wp-tools`). The app root redirects to the WordPress site (`WEBSITE_URL`), and WhatsApp
messages link to WordPress for role guides, membership and the meeting page (`MEETING_PAGE_URL`).

## Features (not in WordPress)

### QR poster

Printable poster (`/admin/qr/[id]`) with a QR code to the meeting page on WordPress (`MEETING_PAGE_URL`).
The audience pages (agenda, feedback forms, voting, guest check-in) moved to the WordPress meeting tools
plugin (`../toastmaster-wp-tools`).

### Tools for role holders (`TOOLS_PASSWORD`)

| Feature | Path |
|---|---|
| Timer: full-screen green / amber / red, presets per speech type, switch type while running, +10/30/60 s for a late start, vibration, screen stays on, "colours only" mode, saved per speaker | `/tools/timer` |
| Ah-Counter: tap counters for filler words per speaker, saved per speaker | `/tools/ah-counter` |
| Evaluation recorder: records spoken feedback in the browser; the worker transcribes it (OpenAI) and writes a short summary | `/tools/record` |
| Quick-add a guest from any tool so they also get a recap | in all tools |

### WhatsApp (Baileys, worker)

- **Group chat, automatic:**
  - 4 days before: who does what, the open roles, and a **single-choice poll** of the open roles.
    Tapping an option assigns the role, changing the vote swaps it, removing it frees it; confirmation by DM.
  - 6 and 3 days before, while a speech slot is open: **random speaker draw**. @mentions one of the five
    members who haven't spoken for the longest and sends them a one-tap claim link by DM.
  - 8 hours before: theme, word of the day, speeches and the link to the meeting hub.
- **Direct messages, automatic:**
  - Role reminder with a link to the role guide (2 to 7 days before, depending on the role).
  - Speakers: 7 days and 1 day before, with their evaluator's name.
  - **Personal recap** after the meeting (see below).
  - Officers (`ADMIN_PHONES`): alerts when tmclub.eu needs a human check or is paused.
- **Commands members can send:** `roles`, `take <n>`, `my`, `drop [n]`, `stop`, `start`, and
  `I am <full name>` to link an unknown number to a member.
- **One-tap claim links** (`/claim/[token]`): signed per member and role; claiming needs a button press,
  so WhatsApp link previews can't claim by accident.

### Personal recap after each meeting

Sent 10 minutes after the meeting is finished (button in admin, or automatically 4 hours after the start),
once all recordings are transcribed. Each person gets only what concerns them:

- roles they held and votes they won
- timing of each of their talks, with an on-time check (30 s grace)
- recorded evaluation: AI summary plus the full transcript
- anonymous audience notes, plus an AI summary when there are 3 or more
- filler word counts
- next step: one-tap link to take the same role again and a recommended next role (members),
  or a link to membership (guests)

### Admin (`ADMIN_PASSWORD`)

| Feature | Path |
|---|---|
| WhatsApp pairing (QR), choice of the club group chat, test message | `/admin` |
| tmclub.eu sync status, "Sync now", role changes waiting to be written, failed jobs with Retry | `/admin` |
| Red banner with the human-check link, or "Retry now" when tmclub.eu work is paused | all admin pages |
| Message log: every queued and sent message, with Retry / Cancel | `/admin` |
| Meetings: start / finish, roles, guests, counts of timings, feedback, recordings and votes | `/admin/meetings/[id]` |
| Buttons: send the role poll to the group, ping a random speaker | `/admin/meetings/[id]` |
| Recap preview for every participant before anything is sent, and re-send to people who missed it | `/admin/meetings/[id]` |
| Members and guests: WhatsApp numbers, mute / unmute | `/admin/members` |

### Sync with tmclub.eu (easy-Speak)

- Members and the next 4 meetings with all roles are pulled every 15 minutes via
  [`tmclub-api`](../toastmaster-club-api).
- Role sign-ups from WhatsApp, the poll and claim links are confirmed right away and written to tmclub.eu
  in the background, with retries (see "When tmclub.eu needs a human" below).

## How it works

Two processes share one SQLite database (`$DATA_DIR/club.db`):

- **Web app** (Next.js): meeting hub, tools, admin, claim links.
- **Worker** (`src/worker`), two independent loops every 20 s:
  - Everything that only needs our database: scheduling messages (`scheduler.ts`), polls and speaker pings
    (`src/lib/engagement.ts`), transcribing recordings, building recaps (`summaries.ts`), and sending the
    outbox through WhatsApp, 2 s apart.
  - tmclub.eu: sync and the role write-back queue (`tmclub.ts`). It runs separately because a pending
    Cloudflare check can make a call wait up to 15 minutes.

Every message goes through the outbox and is visible in the admin message log. Messages are idempotent
(`outbox.dedupe_key`), so restarts don't resend.

## Setup

```bash
cp .env.example .env    # fill in passwords, APP_SECRET, tmclub + OpenAI credentials
pnpm install
pnpm dev                # web on :3000
pnpm dev:worker         # worker (opens Chromium once for Cloudflare, shows WhatsApp QR in /admin)
pnpm seed:demo          # optional: demo members + meetings in an empty DB
```

Then in `/admin`:

1. Scan the WhatsApp QR with the club phone (WhatsApp → Linked devices). Use a dedicated number.
2. Pick the club group chat (the bot's number must be a member of the group).
3. Add members' phone numbers under *Members*, or let them message the bot `I am <name>`.
4. Set `MEETING_PAGE_URL` and print the QR poster (`/admin/qr/<id>`); one print works for every meeting.

**The tmclub.eu account must be a club officer**: only officers can assign roles for other members.

### Docker

```bash
docker compose up -d --build   # expects ../toastmaster-club-api next to this repo
```

The image runs the web app and the worker (under `xvfb`, because Cloudflare blocks headless Chromium).
Data (DB, WhatsApp session, tmclub session, recordings) lives in `./data`.

## When tmclub.eu needs a human

easy-Speak sits behind Cloudflare. Usually the worker's browser passes by itself and the cookie lasts
about a year (kept in `data/tmclub-session.json`). When Cloudflare asks for "Verify you are human":

- The worker opens a live view of its browser on port `8732` (`TMCLUB_VERIFY_URL` = its public HTTPS
  address) and sends the link to `ADMIN_PHONES` on WhatsApp; `/admin` shows a red banner with it.
- Meanwhile only tmclub.eu work waits. Reminders, recaps, polls, pings and the website keep running,
  and WhatsApp sign-ups are confirmed right away and queued.
- If nobody solves it in time (or the login is rejected), tmclub.eu work stays paused until an
  officer presses **Retry now**, on purpose: repeated attempts make Cloudflare stricter.
- Queued role changes then replay. Each one re-reads the slot on tmclub.eu first: done if it's
  already right, dropped (member told) if someone took the slot there meanwhile, skipped for
  meetings that are over. Network errors retry after 1, 5, 15, 60 minutes (about 6 h in total).

## Things to know

- **WhatsApp via Baileys is unofficial.** It links like WhatsApp Web. Keep message volume low (it already
  spaces sends) and don't use a personal number: there is a small risk of the number being banned.
- **Club details** (name, venue, schedule, fees, links) are in `src/lib/club.ts`. Role guides, timing presets and
  filler words are in `src/lib/roles.ts`. Message texts are in `src/lib/messages.ts`.
- **Schema changes:** edit `src/lib/db/schema.ts`, run `pnpm db:generate`; migrations apply on startup.
- `tmclub-api` is linked from `../toastmaster-club-api` until it is published to npm.
