import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import type { DigestRow } from './digest/types.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// One night on disk with its counts (sums over the digest rows). Counts are null when the night
// can't be read; the view renders `—`.
export type NightSummary = {
  night: string;
  ok: number | null;
  retry: number | null;
  fail: number | null;
  badLines: number;
};

export function summarizeNight(runsDir: string, night: string): NightSummary {
  const read = readNight(runsDir, night);
  if (!read) return { night, ok: null, retry: null, fail: null, badLines: 0 };
  const rows = read.rows;
  const sum = (f: (r: DigestRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    night,
    ok: sum((r) => r.ok),
    retry: sum((r) => r.retries),
    fail: sum((r) => r.fail),
    badLines: read.badLines,
  };
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarizeNight(config.runsDir, n)),
  };
}
