// Plan morning-digest § 1. Shapes only; the reader lives next to this file (issue #2).

// `Status` in ../status.ts is the board's; this one is a run log line's.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing. `at` keeps the log's offset (never UTC).
export type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. runs = ok + retries + fail (retries = `retry` lines), so a night's
// ok / retry / fail counts are sums over its rows. owner and lastError are null when the log
// has none (views render `—`).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  ok: number;
  retries: number;
  fail: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// A night as read: rows sorted by job, plus lines that didn't parse (counted, never thrown).
// Empty rows = the file is there but nothing ran.
export type Night = { night: string; rows: DigestRow[]; badLines: number };

// null = no file for this night (routes return 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
