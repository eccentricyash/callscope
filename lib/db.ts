import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/** Single source of truth for the store's shape — used by the seed script,
 *  the ingest endpoint and the test fixtures. */
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY,
    session_id   TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    event_type   TEXT NOT NULL,
    session_type TEXT NOT NULL,
    platform     TEXT NOT NULL,
    ts           INTEGER NOT NULL,
    payload      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
`;

function dbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), "data", "callscope.db");
}

let readDb: Database.Database | null = null;
let writeDb: Database.Database | null = null;

/** Read-only connection — everything the dashboard renders goes through this. */
export function getDb(): Database.Database {
  if (!readDb) {
    const p = dbPath();
    if (!fs.existsSync(p)) {
      throw new Error(
        `No telemetry database at ${p}. Run \`npm run seed\` or POST events to /api/events first.`,
      );
    }
    readDb = new Database(p, { readonly: true, fileMustExist: true });
  }
  return readDb;
}

/** Writable connection for ingest. Creates the database and schema if absent.
 *  Throws on read-only filesystems (e.g. serverless demo deployments) —
 *  callers turn that into a 503. */
export function getWritableDb(): Database.Database {
  if (!writeDb) {
    const p = dbPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    writeDb = new Database(p);
    writeDb.exec(SCHEMA_SQL);
  }
  return writeDb;
}
