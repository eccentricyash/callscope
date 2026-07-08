/*
 * Synthetic RTC telemetry generator.
 *
 * Emits an event-sourced stream for ~90 days of call / meet / screenshare
 * sessions with realistic shape: weekday/weekend volume, diurnal peaks,
 * lognormal ring→accept latency and durations, and a small tail of abnormal
 * end reasons (network loss, app killed, expired auth token, server errors) —
 * the failure modes that real call platforms actually see.
 *
 * Deterministic: same seed → same database.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { SCHEMA_SQL } from "../lib/db";

const DAYS = 90;
const DB_PATH = path.join(process.cwd(), "data", "callscope.db");

// ---------- seeded randomness ----------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260708);

/** Lognormal sample around a median, clamped. */
function lognormal(medianMs: number, sigma: number, minMs: number, maxMs: number) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(maxMs, Math.max(minMs, medianMs * Math.exp(sigma * z)));
}

function pick<T>(table: [T, number][]): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of table) {
    r -= weight;
    if (r <= 0) return value;
  }
  return table[table.length - 1][0];
}

// ---------- distributions ----------

const SESSION_TYPES: ["call" | "meet" | "screenshare", number][] = [
  ["call", 0.55],
  ["meet", 0.3],
  ["screenshare", 0.15],
];

const PLATFORMS: [string, number][] = [
  ["android", 0.38],
  ["ios", 0.27],
  ["windows", 0.18],
  ["macos", 0.09],
  ["web", 0.08],
];

const RING_OUTCOMES: [string, number][] = [
  ["accepted", 0.66],
  ["ring_timeout", 0.13],
  ["declined", 0.08],
  ["missed", 0.08],
  ["canceled", 0.05],
];

const END_REASONS: [string, number][] = [
  ["user_hangup", 0.87],
  ["network_lost", 0.06],
  ["app_killed", 0.04],
  ["token_expired", 0.02],
  ["server_error", 0.01],
];

const DURATION_MEDIAN_MS: Record<string, number> = {
  call: 6 * 60_000,
  meet: 22 * 60_000,
  screenshare: 14 * 60_000,
};

// hour-of-day weights: morning and evening peaks
const HOUR_WEIGHTS = [
  1, 1, 1, 1, 1, 2, 3, 5, 8, 11, 13, 12, 10, 9, 9, 10, 11, 12, 14, 15, 13, 9,
  5, 2,
];

// ---------- generation ----------

interface Event {
  session_id: string;
  event_type: string;
  session_type: string;
  platform: string;
  ts: number;
  payload: string | null;
}

function sessionStartTs(dayStart: number): number {
  const hour = pick(HOUR_WEIGHTS.map((w, h) => [h, w] as [number, number]));
  return dayStart + hour * 3_600_000 + Math.floor(rand() * 3_600_000);
}

function generateSession(id: string, startTs: number): Event[] {
  const type = pick(SESSION_TYPES);
  const platform = pick(PLATFORMS);
  const ev = (event_type: string, ts: number, payload?: object): Event => ({
    session_id: id,
    event_type,
    session_type: type,
    platform,
    ts: Math.round(ts),
    payload: payload ? JSON.stringify(payload) : null,
  });

  const events: Event[] = [ev("initiated", startTs)];
  let connectedAt: number | null = null;

  if (type === "meet") {
    // meets are joined from a link/room, not rung
    connectedAt = startTs + lognormal(4_000, 0.6, 1_000, 60_000);
  } else {
    const ringAt = startTs + lognormal(900, 0.4, 300, 4_000);
    const outcome = pick(RING_OUTCOMES);
    if (outcome === "missed") {
      // no reachable device — never rang, flagged after the ring window
      events.push(ev("missed", startTs + 30_000));
      return events;
    }
    events.push(ev("ring_started", ringAt));
    if (outcome === "accepted") {
      const acceptedAt = ringAt + lognormal(3_800, 0.55, 800, 28_000);
      events.push(ev("accepted", acceptedAt));
      connectedAt = acceptedAt + lognormal(1_200, 0.5, 300, 8_000);
    } else if (outcome === "ring_timeout") {
      events.push(ev("ring_timeout", ringAt + 30_000));
      return events;
    } else {
      const at =
        ringAt + (outcome === "declined" ? lognormal(4_500, 0.5, 1_000, 25_000) : lognormal(2_500, 0.6, 500, 15_000));
      events.push(ev(outcome, at));
      return events;
    }
  }

  events.push(ev("connected", connectedAt));

  const duration = lognormal(DURATION_MEDIAN_MS[type], 0.8, 15_000, 3 * 3_600_000);
  const endedAt = connectedAt + duration;

  // occasional mid-call ICE restarts / network blips
  let reconnects = 0;
  while (rand() < 0.18 && reconnects < 3) reconnects++;
  for (let i = 0; i < reconnects; i++) {
    events.push(ev("reconnect", connectedAt + rand() * duration, { attempt: i + 1 }));
  }

  const reason = pick(END_REASONS);
  events.push(ev("ended", endedAt, { reason }));
  return events;
}

function main() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.rmSync(DB_PATH, { force: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);

  const insert = db.prepare(
    `INSERT INTO events (session_id, event_type, session_type, platform, ts, payload)
     VALUES (@session_id, @event_type, @session_type, @platform, @ts, @payload)`,
  );

  const now = Date.now();
  const dayMs = 24 * 3_600_000;
  let sessionCount = 0;
  let eventCount = 0;

  const insertMany = db.transaction((events: Event[]) => {
    for (const e of events) insert.run(e);
  });

  for (let d = DAYS; d >= 1; d--) {
    const dayStart = now - d * dayMs;
    const weekday = new Date(dayStart).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    // slight upward trend over the window + daily jitter
    const base = (isWeekend ? 38 : 72) * (1 + (DAYS - d) / DAYS / 4);
    const n = Math.round(base * (0.85 + rand() * 0.3));

    const dayEvents: Event[] = [];
    for (let i = 0; i < n; i++) {
      sessionCount++;
      dayEvents.push(
        ...generateSession(`s_${sessionCount.toString(36)}`, sessionStartTs(dayStart)),
      );
    }
    insertMany(dayEvents);
    eventCount += dayEvents.length;
  }

  // WAL is fast for the bulk insert, but a WAL db can't be opened from a
  // read-only filesystem (serverless deploys) — switch back before shipping.
  db.pragma("journal_mode = DELETE");
  db.close();
  console.log(
    `Seeded ${DB_PATH}: ${sessionCount} sessions, ${eventCount} events over ${DAYS} days.`,
  );
}

main();
