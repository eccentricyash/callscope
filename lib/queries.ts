import { getDb } from "./db";

/*
 * All metrics are DERIVED from the raw event stream with SQL — nothing is
 * pre-computed at write time. The `sessions` CTE pivots per-session events
 * (initiated → ring → accept → connect → end) into one row per session,
 * and every metric aggregates over that.
 */

export type RangeDays = 7 | 30 | 90;

export interface Kpis {
  totalSessions: number;
  totalSessionsDelta: number; // % vs previous window
  activeUsers: number; // distinct users who started a session
  activeUsersDelta: number; // %
  totalConnectedMs: number; // summed time actually spent in sessions
  totalConnectedMsDelta: number; // %
  connectRate: number; // 0..1, connected / initiated
  connectRateDelta: number; // percentage-point change
  medianRingToAcceptMs: number;
  medianRingToAcceptDeltaMs: number;
  medianDurationMs: number;
  medianDurationDeltaMs: number;
  abnormalEndRate: number; // 0..1, non-hangup ends / ended sessions
  abnormalEndRateDelta: number; // percentage-point change
  reconnectsPer100: number; // reconnect events per 100 connected sessions
  reconnectsPer100Delta: number;
}

export interface DailyVolumeRow {
  day: string; // YYYY-MM-DD
  call: number;
  meet: number;
  screenshare: number;
}

export interface CountRow {
  label: string;
  count: number;
}

export interface DailyValueRow {
  day: string; // YYYY-MM-DD
  value: number;
}

export interface LatencyBucket {
  bucket: string; // "0–2s", …
  count: number;
}

export interface Metrics {
  rangeDays: RangeDays;
  kpis: Kpis;
  dailyVolume: DailyVolumeRow[];
  dailyUsers: DailyValueRow[]; // distinct users per day
  dailyMinutes: DailyValueRow[]; // connected minutes per day
  ringOutcomes: CountRow[];
  latencyHistogram: LatencyBucket[];
  endReasons: CountRow[];
}

const SESSIONS_CTE = `
  WITH sessions AS (
    SELECT
      session_id,
      session_type,
      platform,
      MAX(user_id) AS user_id,
      MIN(CASE WHEN event_type = 'initiated'    THEN ts END) AS initiated_at,
      MIN(CASE WHEN event_type = 'ring_started' THEN ts END) AS ring_at,
      MIN(CASE WHEN event_type = 'accepted'     THEN ts END) AS accepted_at,
      MIN(CASE WHEN event_type = 'connected'    THEN ts END) AS connected_at,
      MAX(CASE WHEN event_type = 'ended'        THEN ts END) AS ended_at,
      MAX(CASE WHEN event_type IN ('accepted','declined','ring_timeout','missed','canceled')
               THEN event_type END)                          AS ring_outcome,
      MAX(CASE WHEN event_type = 'ended'
               THEN json_extract(payload, '$.reason') END)   AS end_reason,
      SUM(CASE WHEN event_type = 'reconnect' THEN 1 ELSE 0 END) AS reconnects
    FROM events
    GROUP BY session_id, session_type, platform
  )
`;

/** Dashboard "now" = latest event, so seeded data never ages out of view. */
function anchorTs(): number {
  const row = getDb()
    .prepare(`SELECT MAX(ts) AS max_ts FROM events`)
    .get() as { max_ts: number };
  return row.max_ts;
}

function windowBounds(rangeDays: RangeDays, anchor: number) {
  const ms = rangeDays * 24 * 60 * 60 * 1000;
  return { from: anchor - ms, to: anchor, prevFrom: anchor - 2 * ms };
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface WindowStats {
  total: number;
  activeUsers: number;
  connectRate: number;
  medianRingToAcceptMs: number;
  medianDurationMs: number;
  totalConnectedMs: number;
  abnormalEndRate: number;
  reconnectsPer100: number;
}

function statsForWindow(from: number, to: number): WindowStats {
  const db = getDb();
  const totals = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT COUNT(*) AS total,
              COUNT(DISTINCT user_id) AS users,
              SUM(CASE WHEN connected_at IS NOT NULL THEN 1 ELSE 0 END) AS connected,
              SUM(reconnects) AS reconnects,
              SUM(CASE WHEN end_reason IS NOT NULL THEN 1 ELSE 0 END) AS ended,
              SUM(CASE WHEN end_reason IS NOT NULL AND end_reason != 'user_hangup'
                       THEN 1 ELSE 0 END) AS abnormal_ends
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?`,
    )
    .get(from, to) as {
    total: number;
    users: number;
    connected: number;
    reconnects: number | null;
    ended: number;
    abnormal_ends: number;
  };

  const accepts = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT accepted_at - ring_at AS latency
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
         AND accepted_at IS NOT NULL AND ring_at IS NOT NULL
       ORDER BY latency`,
    )
    .all(from, to) as { latency: number }[];

  const durations = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT ended_at - connected_at AS duration
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
         AND connected_at IS NOT NULL AND ended_at IS NOT NULL
       ORDER BY duration`,
    )
    .all(from, to) as { duration: number }[];

  return {
    total: totals.total,
    activeUsers: totals.users,
    connectRate: totals.total ? totals.connected / totals.total : 0,
    medianRingToAcceptMs: median(accepts.map((r) => r.latency)),
    medianDurationMs: median(durations.map((r) => r.duration)),
    totalConnectedMs: durations.reduce((s, r) => s + r.duration, 0),
    abnormalEndRate: totals.ended ? totals.abnormal_ends / totals.ended : 0,
    reconnectsPer100: totals.connected
      ? ((totals.reconnects ?? 0) / totals.connected) * 100
      : 0,
  };
}

function pctDelta(cur: number, prev: number): number {
  return prev ? ((cur - prev) / prev) * 100 : 0;
}

export function getMetrics(rangeDays: RangeDays): Metrics {
  const db = getDb();
  const anchor = anchorTs();
  const { from, to, prevFrom } = windowBounds(rangeDays, anchor);

  const cur = statsForWindow(from, to);
  const prev = statsForWindow(prevFrom, from);

  const kpis: Kpis = {
    totalSessions: cur.total,
    totalSessionsDelta: pctDelta(cur.total, prev.total),
    activeUsers: cur.activeUsers,
    activeUsersDelta: pctDelta(cur.activeUsers, prev.activeUsers),
    totalConnectedMs: cur.totalConnectedMs,
    totalConnectedMsDelta: pctDelta(cur.totalConnectedMs, prev.totalConnectedMs),
    connectRate: cur.connectRate,
    connectRateDelta: (cur.connectRate - prev.connectRate) * 100,
    medianRingToAcceptMs: cur.medianRingToAcceptMs,
    medianRingToAcceptDeltaMs:
      cur.medianRingToAcceptMs - prev.medianRingToAcceptMs,
    medianDurationMs: cur.medianDurationMs,
    medianDurationDeltaMs: cur.medianDurationMs - prev.medianDurationMs,
    abnormalEndRate: cur.abnormalEndRate,
    abnormalEndRateDelta: (cur.abnormalEndRate - prev.abnormalEndRate) * 100,
    reconnectsPer100: cur.reconnectsPer100,
    reconnectsPer100Delta: cur.reconnectsPer100 - prev.reconnectsPer100,
  };

  const dailyVolume = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT date(initiated_at / 1000, 'unixepoch') AS day,
              SUM(CASE WHEN session_type = 'call'        THEN 1 ELSE 0 END) AS call,
              SUM(CASE WHEN session_type = 'meet'        THEN 1 ELSE 0 END) AS meet,
              SUM(CASE WHEN session_type = 'screenshare' THEN 1 ELSE 0 END) AS screenshare
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
       GROUP BY day
       ORDER BY day`,
    )
    .all(from, to) as DailyVolumeRow[];

  const dailyUsers = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT date(initiated_at / 1000, 'unixepoch') AS day,
              COUNT(DISTINCT user_id) AS value
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
       GROUP BY day
       ORDER BY day`,
    )
    .all(from, to) as DailyValueRow[];

  const dailyMinutes = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT date(initiated_at / 1000, 'unixepoch') AS day,
              SUM(ended_at - connected_at) / 60000.0 AS value
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
         AND connected_at IS NOT NULL AND ended_at IS NOT NULL
       GROUP BY day
       ORDER BY day`,
    )
    .all(from, to) as DailyValueRow[];

  // Ring outcomes apply to ringed session types only (meets are joined, not rung).
  const ringOutcomes = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT ring_outcome AS label, COUNT(*) AS count
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
         AND ring_outcome IS NOT NULL
       GROUP BY ring_outcome
       ORDER BY count DESC`,
    )
    .all(from, to) as CountRow[];

  const latencies = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT accepted_at - ring_at AS latency
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
         AND accepted_at IS NOT NULL AND ring_at IS NOT NULL`,
    )
    .all(from, to) as { latency: number }[];

  const edges = [0, 2, 4, 6, 8, 10, 15, 20]; // seconds
  const latencyHistogram: LatencyBucket[] = edges.map((lo, i) => {
    const hi = edges[i + 1];
    const count = latencies.filter(
      (r) => r.latency >= lo * 1000 && (hi === undefined || r.latency < hi * 1000),
    ).length;
    return { bucket: hi === undefined ? `${lo}s+` : `${lo}–${hi}s`, count };
  });

  const endReasons = db
    .prepare(
      `${SESSIONS_CTE}
       SELECT end_reason AS label, COUNT(*) AS count
       FROM sessions
       WHERE initiated_at >= ? AND initiated_at < ?
         AND end_reason IS NOT NULL
       GROUP BY end_reason
       ORDER BY count DESC`,
    )
    .all(from, to) as CountRow[];

  return {
    rangeDays,
    kpis,
    dailyVolume,
    dailyUsers,
    dailyMinutes,
    ringOutcomes,
    latencyHistogram,
    endReasons,
  };
}
