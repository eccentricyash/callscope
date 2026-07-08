import type Database from "better-sqlite3";
import { z } from "zod";

/*
 * Ingest validation. The schema is the contract: anything a client POSTs to
 * /api/events must parse against it before touching the database.
 */

export const EVENT_TYPES = [
  "initiated",
  "ring_started",
  "accepted",
  "declined",
  "ring_timeout",
  "missed",
  "canceled",
  "connected",
  "reconnect",
  "ended",
] as const;

export const eventSchema = z.object({
  session_id: z.string().min(1).max(128),
  event_type: z.enum(EVENT_TYPES),
  session_type: z.enum(["call", "meet", "screenshare"]),
  platform: z.enum(["android", "ios", "windows", "macos", "web"]),
  ts: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const batchSchema = z.array(eventSchema).min(1).max(1000);

/** A single event or a batch of up to 1,000. */
export const ingestSchema = z.union([eventSchema, batchSchema]);

export type IngestEvent = z.infer<typeof eventSchema>;

export function insertEvents(db: Database.Database, events: IngestEvent[]): number {
  const insert = db.prepare(
    `INSERT INTO events (session_id, event_type, session_type, platform, ts, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const run = db.transaction((batch: IngestEvent[]) => {
    for (const e of batch) {
      insert.run(
        e.session_id,
        e.event_type,
        e.session_type,
        e.platform,
        e.ts,
        e.payload ? JSON.stringify(e.payload) : null,
      );
    }
  });
  run(events);
  return events.length;
}
