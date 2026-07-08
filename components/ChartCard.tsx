import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Accessible twin of the chart — every plotted value, as plain text. */
  table: { columns: string[]; rows: (string | number)[][] };
}

export default function ChartCard({ title, subtitle, children, table }: ChartCardProps) {
  return (
    <section className="flex flex-col rounded-xl border border-(--border) bg-(--surface-1) p-4">
      <h2 className="text-sm font-semibold text-(--text-primary)">{title}</h2>
      <p className="mt-0.5 text-xs text-(--text-muted)">{subtitle}</p>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-(--text-muted) hover:text-(--text-secondary)">
          View as table
        </summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="tabular w-full text-left text-xs">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="border-b border-(--grid) py-1 pr-4 font-medium text-(--text-secondary)">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-(--grid) py-1 pr-4 text-(--text-secondary)">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
