// Plan morning-digest § 1 (issue #2): read runs/<night>.jsonl into one row per job.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, LogLine, Night, ReadNight, RunStatus } from './types.js';

// `night` comes from a URL: only a plain date may reach the filesystem.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

// Parse at the edge: a line is a LogLine or it is a bad line (null). Never throws.
export function parseLine(text: string): LogLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || o.at === '') return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (!isStatus(o.status)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const line: LogLine = { at: o.at, job: o.job, status: o.status, owner: o.owner };
  if (o.error !== undefined) line.error = o.error;
  return line;
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

// first/last are by line order (the log is append-only; times keep the log's offset as written).
// lastStatus is the job's last line; lastError is the most recent error seen for the job (a later
// `ok` without an error doesn't erase it), null if the job never logged one. owner is the most
// recent non-null owner seen, null if every line had owner null.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const line = parseLine(trimmed);
    if (line === null) {
      badLines++;
      continue;
    }
    let row = rows.get(line.job);
    if (row === undefined) {
      row = {
        job: line.job,
        owner: line.owner,
        runs: 0,
        ok: 0,
        retries: 0,
        fail: 0,
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      rows.set(line.job, row);
    }
    row.runs++;
    if (line.status === 'ok') row.ok++;
    else if (line.status === 'retry') row.retries++;
    else row.fail++;
    if (line.owner !== null) row.owner = line.owner;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    if (line.error !== undefined) row.lastError = line.error;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night, rows: sorted, badLines };
  return result;
};
