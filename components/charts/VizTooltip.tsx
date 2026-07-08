"use client";

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  fill?: string;
}

export interface VizTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<TooltipEntry>;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number) => string;
}

/** Shared tooltip: value leads (bold), series name follows, keyed by a short
 *  stroke of the series color. Names/labels are rendered as text nodes. */
export default function VizTooltip({
  active,
  label,
  payload,
  labelFormatter,
  valueFormatter,
}: VizTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-(--border) bg-(--surface-1) px-3 py-2 shadow-sm">
      {label !== undefined && (
        <div className="mb-1 text-xs text-(--text-muted)">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <span
            aria-hidden
            className="h-3 w-0.75 rounded-full"
            style={{ background: entry.color ?? entry.fill }}
          />
          <span className="tabular font-semibold text-(--text-primary)">
            {typeof entry.value === "number" && valueFormatter
              ? valueFormatter(entry.value)
              : entry.value}
          </span>
          <span className="text-(--text-secondary)">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
