import Link from "next/link";
import type { RangeDays } from "@/lib/queries";

const OPTIONS: { days: RangeDays; label: string }[] = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export default function RangeFilter({ current }: { current: RangeDays }) {
  return (
    <nav
      aria-label="Date range"
      className="inline-flex rounded-lg border border-(--border) bg-(--surface-1) p-0.5"
    >
      {OPTIONS.map(({ days, label }) => {
        const active = days === current;
        return (
          <Link
            key={days}
            href={days === 30 ? "/" : `/?range=${days}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-(--hover-wash) font-semibold text-(--text-primary)"
                : "text-(--text-secondary) hover:text-(--text-primary)"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
