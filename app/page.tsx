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
  searchParams: Promise<{ range?: string; debug?: string }>;
}) {
  const { range, debug } = await searchParams;
  const rangeDays: RangeDays = range === "7" ? 7 : range === "90" ? 90 : 30;
  const m = getMetrics(rangeDays);

  // temporary: render one component at a time while chasing a vercel-only 500
  if (debug) {
    const probes: Record<string, React.ReactNode> = {
      data: <pre>{JSON.stringify(m.kpis, null, 2)}</pre>,
      tile: (
        <StatTile label="Sessions" value={fmtInt(m.kpis.totalSessions)} deltaCaption="test" />
      ),
      filter: <RangeFilter current={rangeDays} />,
      card: (
        <ChartCard title="t" subtitle="s" table={{ columns: ["a"], rows: [["b"]] }}>
          <div>inner</div>
        </ChartCard>
      ),
      volume: <DailyVolumeChart data={m.dailyVolume} />,
      trend: <TrendChart data={m.dailyUsers} name="Active users" />,
      hbar: (
        <HBarChart
          data={m.ringOutcomes.map((r) => ({ label: r.label, count: r.count }))}
          seriesName="Sessions"
        />
      ),
      hist: <LatencyHistogram data={m.latencyHistogram} />,
    };
    return (
      <main style={{ padding: 16 }}>
        <p>probe: {debug}</p>
        {probes[debug] ?? <p>unknown probe</p>}
      </main>
    );
  }
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
          delta={signed(m.kpis.activeUsersDelta, (v) => `${v.toFixed(1)}%`)}
          deltaGood={m.kpis.activeUsersDelta >= 0}
          deltaCaption={vs}
        />
        <StatTile
          label="Sessions"
          value={fmtInt(m.kpis.totalSessions)}
          delta={signed(m.kpis.totalSessionsDelta, (v) => `${v.toFixed(1)}%`)}
          deltaGood={m.kpis.totalSessionsDelta >= 0}
          deltaCaption={vs}
        />
        <StatTile
          label="Time in sessions"
          value={fmtHours(m.kpis.totalConnectedMs)}
          delta={signed(m.kpis.totalConnectedMsDelta, (v) => `${v.toFixed(1)}%`)}
          deltaGood={m.kpis.totalConnectedMsDelta >= 0}
          deltaCaption={vs}
        />
        <StatTile
          label="Median session length"
          value={fmtDuration(m.kpis.medianDurationMs)}
          delta={signed(m.kpis.medianDurationDeltaMs, fmtDuration)}
          deltaGood={m.kpis.medianDurationDeltaMs >= 0}
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
          <TrendChart data={m.dailyUsers} name="Active users" valueFormatter={fmtInt} />
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
            valueFormatter={(v) => `${fmtInt(v)} min`}
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
          delta={signed(m.kpis.connectRateDelta, (v) => `${v.toFixed(1)} pts`)}
          deltaGood={m.kpis.connectRateDelta >= 0}
          deltaCaption={vs}
        />
        <StatTile
          label="Median ring → accept"
          value={fmtSeconds(m.kpis.medianRingToAcceptMs)}
          delta={signed(m.kpis.medianRingToAcceptDeltaMs, fmtSeconds)}
          deltaGood={m.kpis.medianRingToAcceptDeltaMs <= 0}
          deltaCaption={vs}
        />
        <StatTile
          label="Abnormal end rate"
          value={fmtPct(m.kpis.abnormalEndRate)}
          delta={signed(m.kpis.abnormalEndRateDelta, (v) => `${v.toFixed(1)} pts`)}
          deltaGood={m.kpis.abnormalEndRateDelta <= 0}
          deltaCaption={vs}
        />
        <StatTile
          label="Reconnects / 100 sessions"
          value={m.kpis.reconnectsPer100.toFixed(1)}
          delta={signed(m.kpis.reconnectsPer100Delta, (v) => v.toFixed(1))}
          deltaGood={m.kpis.reconnectsPer100Delta <= 0}
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
