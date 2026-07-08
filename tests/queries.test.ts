import { beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { SCHEMA_SQL } from "../lib/db";
import { getMetrics } from "../lib/queries";

/*
 * Known-answer fixture: a handful of hand-built sessions whose metrics are
 * computable on paper. The dashboard's "now" anchors to the latest event,
 * so the fixture pins that anchor explicitly (s5 ends exactly at A).
 */

const DAY = 86_400_000;
const A = Date.UTC(2026, 5, 30); // anchor = latest event ts

interface Row {
  session_id: string;
  user_id: string;
  event_type: string;
  session_type: string;
  platform: string;
  ts: number;
  payload: string | null;
}

// who owns which session: u1 is a heavy user, u4 only shows up 40 days back
const USER_BY_SESSION: Record<string, string> = {
  s1: "u1",
  s2: "u2",
  s3: "u1",
  s4: "u3",
  s5: "u1",
  s6: "u2",
  s7: "u4",
};

const rows: Row[] = [];
function ev(
  session_id: string,
  session_type: string,
  event_type: string,
  ts: number,
  payload?: object,
) {
  rows.push({
    session_id,
    user_id: USER_BY_SESSION[session_id],
    event_type,
    session_type,
    platform: "android",
    ts,
    payload: payload ? JSON.stringify(payload) : null,
  });
}

// s1: accepted call — ring→accept 4s, duration 60s, normal hang-up
const s1 = A - 2 * DAY;
ev("s1", "call", "initiated", s1);
ev("s1", "call", "ring_started", s1 + 1_000);
ev("s1", "call", "accepted", s1 + 5_000);
ev("s1", "call", "connected", s1 + 6_000);
ev("s1", "call", "ended", s1 + 66_000, { reason: "user_hangup" });

// s2: accepted call — ring→accept 10s, duration 120s, dropped by network
const s2 = A - 1 * DAY;
ev("s2", "call", "initiated", s2);
ev("s2", "call", "ring_started", s2 + 1_000);
ev("s2", "call", "accepted", s2 + 11_000);
ev("s2", "call", "connected", s2 + 12_000);
ev("s2", "call", "reconnect", s2 + 60_000, { attempt: 1 });
ev("s2", "call", "ended", s2 + 132_000, { reason: "network_lost" });

// s3: rang, nobody answered
const s3 = A - 3 * DAY;
ev("s3", "call", "initiated", s3);
ev("s3", "call", "ring_started", s3 + 1_000);
ev("s3", "call", "ring_timeout", s3 + 31_000);

// s4: no device ever rang
const s4 = A - 3 * DAY;
ev("s4", "call", "initiated", s4);
ev("s4", "call", "missed", s4 + 30_000);

// s5: meet — joined, not rung; ends exactly at the anchor
const s5 = A - 6 * 3_600_000;
ev("s5", "meet", "initiated", s5);
ev("s5", "meet", "connected", s5 + 5_000);
ev("s5", "meet", "ended", A, { reason: "user_hangup" });

// s6: screenshare, declined
const s6 = A - 2 * DAY;
ev("s6", "screenshare", "initiated", s6);
ev("s6", "screenshare", "ring_started", s6 + 900);
ev("s6", "screenshare", "declined", s6 + 4_000);

// s7: accepted call 40 days ago — inside 90d window, outside 7d/30d
const s7 = A - 40 * DAY;
ev("s7", "call", "initiated", s7);
ev("s7", "call", "ring_started", s7 + 1_000);
ev("s7", "call", "accepted", s7 + 3_000);
ev("s7", "call", "connected", s7 + 4_000);
ev("s7", "call", "ended", s7 + 64_000, { reason: "user_hangup" });

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "callscope-test-"));
  const dbPath = path.join(dir, "fixture.db");
  const db = new Database(dbPath);
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(
    `INSERT INTO events (session_id, user_id, event_type, session_type, platform, ts, payload)
     VALUES (@session_id, @user_id, @event_type, @session_type, @platform, @ts, @payload)`,
  );
  for (const r of rows) insert.run(r);
  db.close();
  process.env.DB_PATH = dbPath;
});

describe("getMetrics — 7 day window", () => {
  it("counts sessions and connect rate", () => {
    const m = getMetrics(7);
    expect(m.kpis.totalSessions).toBe(6); // s1..s6
    expect(m.kpis.connectRate).toBeCloseTo(3 / 6); // s1, s2, s5 connected
  });

  it("computes median ring→accept and median duration", () => {
    const m = getMetrics(7);
    expect(m.kpis.medianRingToAcceptMs).toBe(7_000); // median of 4s, 10s
    expect(m.kpis.medianDurationMs).toBe(120_000); // 60s, 120s, ~6h → 120s
  });

  it("breaks down ring outcomes, excluding meets", () => {
    const m = getMetrics(7);
    const byLabel = Object.fromEntries(m.ringOutcomes.map((r) => [r.label, r.count]));
    expect(byLabel).toEqual({
      accepted: 2,
      ring_timeout: 1,
      missed: 1,
      declined: 1,
    });
  });

  it("buckets accept latencies", () => {
    const m = getMetrics(7);
    const byBucket = Object.fromEntries(m.latencyHistogram.map((b) => [b.bucket, b.count]));
    expect(byBucket["4–6s"]).toBe(1); // s1 @ 4s
    expect(byBucket["10–15s"]).toBe(1); // s2 @ 10s
    expect(byBucket["0–2s"]).toBe(0);
  });

  it("breaks down end reasons", () => {
    const m = getMetrics(7);
    const byLabel = Object.fromEntries(m.endReasons.map((r) => [r.label, r.count]));
    expect(byLabel).toEqual({ user_hangup: 2, network_lost: 1 });
  });

  it("sums daily volume by session type", () => {
    const m = getMetrics(7);
    const sum = (k: "call" | "meet" | "screenshare") =>
      m.dailyVolume.reduce((s, d) => s + d[k], 0);
    expect(sum("call")).toBe(4);
    expect(sum("meet")).toBe(1);
    expect(sum("screenshare")).toBe(1);
  });
});

describe("getMetrics — usage and health kpis", () => {
  it("counts distinct active users", () => {
    expect(getMetrics(7).kpis.activeUsers).toBe(3); // u1, u2, u3
    expect(getMetrics(90).kpis.activeUsers).toBe(4); // + u4
  });

  it("sums time spent in sessions", () => {
    // 60s + 120s + (6h - 5s) = 21,775,000 ms
    expect(getMetrics(7).kpis.totalConnectedMs).toBe(21_775_000);
  });

  it("computes abnormal end rate and reconnect rate", () => {
    const m = getMetrics(7);
    expect(m.kpis.abnormalEndRate).toBeCloseTo(1 / 3); // s2 network_lost of 3 ended
    expect(m.kpis.reconnectsPer100).toBeCloseTo(100 / 3); // 1 reconnect / 3 connected
  });

  it("builds daily user and minute trends", () => {
    const m = getMetrics(7);
    expect(m.dailyUsers).toHaveLength(3);
    expect(m.dailyUsers.reduce((s, d) => s + d.value, 0)).toBe(6); // 2 + 2 + 2
    const totalMin = m.dailyMinutes.reduce((s, d) => s + d.value, 0);
    expect(totalMin).toBeCloseTo(21_775_000 / 60_000, 1);
  });
});

describe("getMetrics — deltas", () => {
  it("suppresses deltas when the previous window has no data", () => {
    // fixture has nothing in the 7d window's preceding 7 days
    const k = getMetrics(7).kpis;
    expect(k.totalSessionsDelta).toBeNull();
    expect(k.connectRateDelta).toBeNull();
    expect(k.abnormalEndRateDelta).toBeNull();
  });
});

describe("getMetrics — window filtering", () => {
  it("includes the 40-day-old session only in the 90d window", () => {
    expect(getMetrics(7).kpis.totalSessions).toBe(6);
    expect(getMetrics(90).kpis.totalSessions).toBe(7);
    const byBucket = Object.fromEntries(
      getMetrics(90).latencyHistogram.map((b) => [b.bucket, b.count]),
    );
    expect(byBucket["2–4s"]).toBe(1); // s7 @ 3s
  });
});
