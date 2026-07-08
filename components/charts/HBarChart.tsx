"use client";

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtInt } from "@/lib/format";
import VizTooltip from "./VizTooltip";

interface HBarChartProps {
  data: { label: string; count: number }[];
  seriesName: string;
}

/** Single-series horizontal bars, value at each bar tip (so no x-axis needed). */
export default function HBarChart({ data, seriesName }: HBarChartProps) {
  return (
    <div style={{ height: data.length * 40 + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--hover-wash)" }}
            content={<VizTooltip valueFormatter={fmtInt} />}
          />
          <Bar dataKey="count" name={seriesName} fill="var(--series-1)" maxBarSize={18} radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey="count"
              position="right"
              formatter={(v: React.ReactNode) => fmtInt(Number(v))}
              style={{ fill: "var(--text-secondary)", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
