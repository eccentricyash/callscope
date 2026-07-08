import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../lib/db";
import { ingestSchema, insertEvents, type IngestEvent } from "../lib/ingest";

const valid: IngestEvent = {
  session_id: "s_abc",
  event_type: "accepted",
  session_type: "call",
  platform: "android",
  ts: 1_751_000_000_000,
};

describe("ingest schema", () => {
  it("accepts a single valid event", () => {
    expect(ingestSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a batch and rejects oversized batches", () => {
    expect(ingestSchema.safeParse([valid, valid]).success).toBe(true);
    expect(ingestSchema.safeParse(Array(1001).fill(valid)).success).toBe(false);
  });

  it("rejects unknown event types and platforms", () => {
    expect(ingestSchema.safeParse({ ...valid, event_type: "exploded" }).success).toBe(false);
    expect(ingestSchema.safeParse({ ...valid, platform: "toaster" }).success).toBe(false);
  });

  it("rejects missing fields and bad timestamps", () => {
    const noTs: Record<string, unknown> = { ...valid };
    delete noTs.ts;
    expect(ingestSchema.safeParse(noTs).success).toBe(false);
    expect(ingestSchema.safeParse({ ...valid, ts: -5 }).success).toBe(false);
    expect(ingestSchema.safeParse({ ...valid, ts: 1.5 }).success).toBe(false);
  });
});

describe("insertEvents", () => {
  it("writes events with serialized payloads", () => {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    insertEvents(db, [
      valid,
      { ...valid, event_type: "ended", payload: { reason: "network_lost" } },
    ]);
    const rows = db.prepare("SELECT event_type, payload FROM events ORDER BY id").all() as {
      event_type: string;
      payload: string | null;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].payload).toBeNull();
    expect(JSON.parse(rows[1].payload!)).toEqual({ reason: "network_lost" });
  });
});
