import { getWritableDb } from "@/lib/db";
import { batchSchema, eventSchema, insertEvents } from "@/lib/ingest";

/**
 * POST /api/events — ingest telemetry.
 * Body: one event object, or an array of up to 1,000.
 *
 * 201 {inserted: n} · 400 on malformed JSON or schema violation ·
 * 503 when the store is read-only (hosted demo).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // parse against the concrete shape so validation errors name the field,
  // instead of a vague union-level "invalid input"
  const parsed = Array.isArray(body)
    ? batchSchema.safeParse(body)
    : eventSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "validation_failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  try {
    insertEvents(getWritableDb(), events);
  } catch {
    return Response.json(
      {
        error: "read_only_store",
        message:
          "This deployment's telemetry store is read-only (demo mode). Run the project locally to ingest events.",
      },
      { status: 503 },
    );
  }
  return Response.json({ inserted: events.length }, { status: 201 });
}
