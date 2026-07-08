"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyValueRow } from "@/lib/queries";
import { shortDay } from "@/lib/format";
import VizTooltip from "./VizTooltip";

interface TrendChartProps {
  data: DailyValueRow[];
  name: string;
  valueFormatter?: (v: number) => string;
}

/** Single-series daily trend: 2px line over a 10% wash. */
export default function TrendChart({ data, name, valueFormatter }: TrendChartProps) {
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
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
            cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
            content={
              <VizTooltip
                labelFormatter={(l) => shortDay(String(l))}
                valueFormatter={valueFormatter}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name={name}
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="var(--series-1)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface-1)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
