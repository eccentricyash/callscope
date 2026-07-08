"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyVolumeRow } from "@/lib/queries";
import { shortDay } from "@/lib/format";
import VizTooltip from "./VizTooltip";

const SERIES = [
  { key: "call", label: "Call", color: "var(--series-1)" },
  { key: "meet", label: "Meet", color: "var(--series-2)" },
  { key: "screenshare", label: "Screen share", color: "var(--series-3)" },
] as const;

export default function DailyVolumeChart({ data }: { data: DailyVolumeRow[] }) {
  return (
    <div>
      <div className="mb-2 flex gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-(--text-secondary)">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tickLine={false}
              axisLine={{ stroke: "var(--baseline)" }}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--hover-wash)" }}
              content={<VizTooltip labelFormatter={(l) => shortDay(String(l))} />}
            />
            {SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="sessions"
                fill={s.color}
                stroke="var(--surface-1)"
                strokeWidth={1}
                maxBarSize={24}
                radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
