import ChartCard from "@/components/ChartCard";
import RangeFilter from "@/components/RangeFilter";
import StatTile from "@/components/StatTile";
import DailyVolumeChart from "@/components/charts/DailyVolumeChart";
import HBarChart from "@/components/charts/HBarChart";
import LatencyHistogram from "@/components/charts/LatencyHistogram";
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

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sessions"
          value={fmtInt(m.kpis.totalSessions)}
          delta={signed(m.kpis.totalSessionsDelta, (v) => `${v.toFixed(1)}%`)}
          deltaGood={m.kpis.totalSessionsDelta >= 0}
          deltaCaption={vs}
        />
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
          label="Median session length"
          value={fmtDuration(m.kpis.medianDurationMs)}
          delta={signed(m.kpis.medianDurationDeltaMs, fmtDuration)}
          deltaGood={m.kpis.medianDurationDeltaMs >= 0}
          deltaCaption={vs}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ChartCard
            title="Sessions per day"
            subtitle="Volume by session type — is usage healthy, and what drives it?"
            table={{
              columns: ["Day", "Call", "Meet", "Screen share"],
              rows: m.dailyVolume.map((d) => [shortDay(d.day), d.call, d.meet, d.screenshare]),
            }}
          >
            <DailyVolumeChart data={m.dailyVolume} />
          </ChartCard>
        </div>

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
