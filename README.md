# Club Manager — Malmö Toastmasters

Public website plus meeting tools for a Toastmasters club. Members mostly use it through WhatsApp:
they get reminders, sign up for roles, and receive a personal recap after every meeting.

## What's in it

| Area | Path | Who |
|---|---|---|
| Public website: home, meetings, role guides, membership, about | `/`, `/meetings`, `/roles/[slug]`, `/membership`, `/about` | everyone |
| Meeting hub (the QR code target, like a Linktree) | `/m` → `/m/[id]` | audience |
| Anonymous speech feedback (one positive, one tip) | `/m/[id]/feedback` | audience |
| Voting: best speaker / table topic / evaluator / role | `/m/[id]/vote` | audience |
| Guest check-in (optional WhatsApp number for their recap) | `/m/[id]/guest` | guests |
| One-click role sign-up from WhatsApp recaps | `/claim/[token]` | members |
| Timer: full-screen green/amber/red, presets, +10/30/60 s, vibration, history | `/tools/timer` | `TOOLS_PASSWORD` |
| Ah-Counter | `/tools/ah-counter` | `TOOLS_PASSWORD` |
| Evaluation recorder: transcribed + summarised by OpenAI | `/tools/record` | `TOOLS_PASSWORD` |
| Admin: role poll + random speaker ping buttons, WhatsApp pairing, group, sync, members' phone numbers, meeting control, recap preview, message log, QR poster | `/admin` | `ADMIN_PASSWORD` |

## How it works

Two processes share one SQLite database (`$DATA_DIR/club.db`):

- **Web app** (Next.js): pages, forms, tools.
- **Worker** (`src/worker`): every 20 s it
  - syncs members and the next 4 meetings (with roles) from tmclub.eu every 15 min, via [`tmclub-api`](../toastmaster-club-api);
  - pushes role sign-ups made on WhatsApp or via claim links to tmclub.eu (`tm_jobs`);
  - queues scheduled WhatsApp messages (`src/worker/scheduler.ts`):
    - **group**, 4 days before: who does what + open roles, followed by a **single-choice poll** of the open roles —
      tapping an option assigns the role (changing the vote swaps it, removing it frees it); confirmation goes by DM
    - **group**, 6 and 3 days before, while a speech slot is open: **random speaker draw** — @mentions one of the five
      members who haven't spoken for the longest, and DMs them a one-tap claim link
    - **group**, 8 h before: theme, word of the day, speeches, link to the meeting hub
    - **role holders**: reminder with a link to the role guide (2–7 days before, depending on the role)
    - **speakers**: 7 days and 1 day before, with their evaluator's name
  - transcribes and summarises recorded evaluations;
  - 10 min after a meeting is finished (button in admin, or automatically 4 h after start) sends each person their **recap**:
    timing with on-time check, evaluation summary + full transcript, anonymous audience notes (+ AI summary at 3+ notes),
    filler words, votes won, and one-click links to take the same role again or a recommended next role;
  - sends the outbox through WhatsApp (Baileys), 2 s apart.

WhatsApp direct-message commands: `roles`, `take <n>`, `my`, `drop [n]`, `stop`, `start`, and
`I am <full name>` to link an unknown number to a member.

Every message is in the admin message log. Messages are idempotent (`outbox.dedupe_key`), so restarts don't resend.

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
3. Add members' phone numbers under *Members* — or let them message the bot `I am <name>`.
4. Print the QR poster (`/admin/qr/<id>`); it points to `/m`, so one print works for every meeting.

**The tmclub.eu account must be a club officer** — only officers can assign roles for other members.

### Docker

```bash
docker compose up -d --build   # expects ../toastmaster-club-api next to this repo
```

The image runs the web app and the worker (under `xvfb`, because Cloudflare blocks headless Chromium).
Data (DB, WhatsApp session, tmclub session, recordings) lives in `./data`.

## Things to know

- **WhatsApp via Baileys is unofficial.** It links like WhatsApp Web. Keep message volume low (it already
  spaces sends) and don't use a personal number — there is a small risk of the number being banned.
- **Club details** (name, venue, schedule, fees, links) are in `src/lib/club.ts`. Role guides, timing presets and
  filler words are in `src/lib/roles.ts`. Message texts are in `src/lib/messages.ts`.
- **Schema changes:** edit `src/lib/db/schema.ts`, run `pnpm db:generate`; migrations apply on startup.
- `tmclub-api` is linked from `../toastmaster-club-api` until it is published to npm.
