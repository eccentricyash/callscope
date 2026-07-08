import ChartCard from "@/components/ChartCard";
import RangeFilter from "@/components/RangeFilter";
import StatTile from "@/components/StatTile";
import DailyVolumeChart from "@/components/charts/DailyVolumeChart";
import HBarChart from "@/components/charts/HBarChart";
import LatencyHistogram from "@/components/charts/LatencyHistogram";
import TrendChart from "@/components/charts/TrendChart";
import { fmtDuration, fmtInt, fmtPct, fmtSeconds, shortDay } from "@/lib/format";
import { getMetrics, type RangeDays } from "@/lib/queries";

export const dynamic = "force-dynamic";

const OUTCOME_LABELS: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  ring_timeout: "No answer (timeout)",
  missed: "Missed (unreachable)",
  canceled: "Canceled by caller",
};

const REASON_LABELS: Record<string, string> = {
  user_hangup: "Normal hang-up",
  network_lost: "Network lost",
  app_killed: "App killed",
  token_expired: "Auth token expired",
  server_error: "Server error",
};

function signed(n: number, fmt: (abs: number) => string): string {
  return `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

/** No delta props at all when there's no previous window to compare against. */
function deltaProps(
  value: number | null,
  fmt: (abs: number) => string,
  upIsGood = true,
): { delta?: string; deltaGood?: boolean } {
  if (value === null) return {};
  return { delta: signed(value, fmt), deltaGood: upIsGood ? value >= 0 : value <= 0 };
}

const pct = (v: number) => `${v.toFixed(1)}%`;
const pts = (v: number) => `${v.toFixed(1)} pts`;

function fmtHours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-(--text-muted)">{note}</p>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const rangeDays: RangeDays = range === "7" ? 7 : range === "90" ? 90 : 30;
  const m = getMetrics(rangeDays);
  const vs = `vs previous ${rangeDays} days`;

  const outcomes = m.ringOutcomes.map((r) => ({
    label: OUTCOME_LABELS[r.label] ?? r.label,
    count: r.count,
  }));
  const reasons = m.endReasons.map((r) => ({
    label: REASON_LABELS[r.label] ?? r.label,
    count: r.count,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">CallScope</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          RTC session analytics — voice calls, meets &amp; screen shares
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <RangeFilter current={rangeDays} />
        <span className="text-xs text-(--text-muted)">
          Synthetic telemetry · metrics derived from raw events with SQL
        </span>
      </div>

      <SectionHeading
        title="Are people using it?"
        note="Reach and engagement — users, sessions, and whether time in the app is growing."
      />
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active users"
          value={fmtInt(m.kpis.activeUsers)}
          {...deltaProps(m.kpis.activeUsersDelta, pct)}
          deltaCaption={vs}
        />
        <StatTile
          label="Sessions"
          value={fmtInt(m.kpis.totalSessions)}
          {...deltaProps(m.kpis.totalSessionsDelta, pct)}
          deltaCaption={vs}
        />
        <StatTile
          label="Time in sessions"
          value={fmtHours(m.kpis.totalConnectedMs)}
          {...deltaProps(m.kpis.totalConnectedMsDelta, pct)}
          deltaCaption={vs}
        />
        <StatTile
          label="Median session length"
          value={fmtDuration(m.kpis.medianDurationMs)}
          {...deltaProps(m.kpis.medianDurationDeltaMs, fmtDuration)}
          deltaCaption={vs}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Active users per day"
          subtitle="Distinct people who started a call, meet or share that day"
          table={{
            columns: ["Day", "Active users"],
            rows: m.dailyUsers.map((d) => [shortDay(d.day), d.value]),
          }}
        >
          <TrendChart data={m.dailyUsers} name="Active users" />
        </ChartCard>

        <ChartCard
          title="Time in sessions per day"
          subtitle="Total connected minutes — the truest 'are they using it more?' line"
          table={{
            columns: ["Day", "Minutes"],
            rows: m.dailyMinutes.map((d) => [shortDay(d.day), Math.round(d.value)]),
          }}
        >
          <TrendChart
            data={m.dailyMinutes.map((d) => ({ ...d, value: Math.round(d.value) }))}
            name="Minutes"
            unit="minutes"
          />
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard
            title="Sessions per day"
            subtitle="Volume by session type — what's driving the usage"
            table={{
              columns: ["Day", "Call", "Meet", "Screen share"],
              rows: m.dailyVolume.map((d) => [shortDay(d.day), d.call, d.meet, d.screenshare]),
            }}
          >
            <DailyVolumeChart data={m.dailyVolume} />
          </ChartCard>
        </div>
      </div>

      <SectionHeading
        title="What's breaking?"
        note="Friction and reliability — why attempts fail and how sessions die."
      />
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Connect success rate"
          value={fmtPct(m.kpis.connectRate)}
          {...deltaProps(m.kpis.connectRateDelta, pts)}
          deltaCaption={vs}
        />
        <StatTile
          label="Median ring → accept"
          value={fmtSeconds(m.kpis.medianRingToAcceptMs)}
          {...deltaProps(m.kpis.medianRingToAcceptDeltaMs, fmtSeconds, false)}
          deltaCaption={vs}
        />
        <StatTile
          label="Abnormal end rate"
          value={fmtPct(m.kpis.abnormalEndRate)}
          {...deltaProps(m.kpis.abnormalEndRateDelta, pts, false)}
          deltaCaption={vs}
        />
        <StatTile
          label="Reconnects / 100 sessions"
          value={m.kpis.reconnectsPer100.toFixed(1)}
          {...deltaProps(m.kpis.reconnectsPer100Delta, (v) => v.toFixed(1), false)}
          deltaCaption={vs}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Ring outcomes"
          subtitle="What happens when a call rings (meets excluded — they're joined, not rung)"
          table={{
            columns: ["Outcome", "Sessions"],
            rows: outcomes.map((r) => [r.label, r.count]),
          }}
        >
          <HBarChart data={outcomes} seriesName="Sessions" />
        </ChartCard>

        <ChartCard
          title="Ring → accept latency"
          subtitle="How long callees take to pick up — slow accepts push callers to hang up"
          table={{
            columns: ["Latency", "Accepted calls"],
            rows: m.latencyHistogram.map((b) => [b.bucket, b.count]),
          }}
        >
          <LatencyHistogram data={m.latencyHistogram} />
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard
            title="Session end reasons"
            subtitle="Everything that isn't a normal hang-up is a reliability signal"
            table={{
              columns: ["Reason", "Sessions"],
              rows: reasons.map((r) => [r.label, r.count]),
            }}
          >
            <HBarChart data={reasons} seriesName="Sessions" />
          </ChartCard>
        </div>
      </div>
    </main>
  );
}
