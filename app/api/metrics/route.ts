import type { NextRequest } from "next/server";
import { getMetrics, type RangeDays } from "@/lib/queries";

/** GET /api/metrics?range=7|30|90 — the dashboard's data, as JSON. */
export function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("range");
  const range: RangeDays = param === "7" ? 7 : param === "90" ? 90 : 30;
  return Response.json(getMetrics(range));
}
