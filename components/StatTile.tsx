interface StatTileProps {
  label: string;
  value: string;
  /** Signed delta text vs the previous window, e.g. "+4.2%" */
  delta?: string;
  /** Whether this delta direction is an improvement */
  deltaGood?: boolean;
  deltaCaption: string;
}

export default function StatTile({ label, value, delta, deltaGood, deltaCaption }: StatTileProps) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface-1) p-4">
      <div className="text-sm text-(--text-secondary)">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-(--text-primary)">{value}</div>
      {delta !== undefined && (
        <div className="mt-1 text-xs text-(--text-muted)">
          <span style={{ color: deltaGood ? "var(--delta-good)" : "var(--delta-bad)" }}>
            {delta}
          </span>{" "}
          {deltaCaption}
        </div>
      )}
    </div>
  );
}
