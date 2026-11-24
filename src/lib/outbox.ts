import { db, schema } from './db';
import type { PollSpec } from './db/schema';

export interface OutboxMessage {
  to: string;
  body: string;
  kind: string;
  meetingId?: number;
  memberId?: number;
  dedupeKey?: string;
  sendAfter?: Date;
  mentions?: string[];
  poll?: PollSpec;
}

/** Queue a WhatsApp message. With a dedupeKey, enqueueing the same message twice is a no-op. */
export function enqueue(msg: OutboxMessage) {
  db.insert(schema.outbox)
    .values({ ...msg, sendAfter: msg.sendAfter ?? new Date() })
    .onConflictDoNothing({ target: schema.outbox.dedupeKey })
    .run();
}
