import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('reads 5 jobs and 1 bad line, sorted by job', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const byJob = Object.fromEntries(night!.rows.map((r) => [r.job, r]));
    expect(byJob['digest/render']!.owner).toBeNull();
    expect(byJob['fixtures/refresh']).toMatchObject({
      runs: 4, ok: 1, retries: 3, fail: 0, lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob['notes/backup']).toMatchObject({ fail: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(byJob['lane/sync']!.firstAt).toBe('2026-10-28T23:00:06+01:00');
    for (const r of night!.rows) expect(r.runs).toBe(r.ok + r.retries + r.fail);
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  it('keeps a row whose owner is null', () => {
    write('2026-01-01', line({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'ok', owner: null }) + '\n');
    const night = readNight(dir, '2026-01-01');
    expect(night!.rows).toEqual([
      {
        job: 'a', owner: null, runs: 1, ok: 1, retries: 0, fail: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-01-01T01:00:00+01:00', lastAt: '2026-01-01T01:00:00+01:00',
      },
    ]);
    expect(night!.badLines).toBe(0);
  });

  it('empty file: no rows, no bad lines', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('missing file: null', () => {
    expect(readNight(dir, '2026-01-03')).toBeNull();
  });

  it('counts bad lines (broken JSON, wrong shape) and skips blank lines', () => {
    write(
      '2026-01-04',
      [
        line({ at: '2026-01-04T01:00:00-05:00', job: 'a', status: 'retry', owner: 'x', error: 'boom' }),
        '{"at":"2026-01-04T01:01:00-05:00","job":"a"',
        line({ at: '2026-01-04T01:02:00-05:00', status: 'ok', owner: 'x' }),
        line({ at: '2026-01-04T01:03:00-05:00', job: 'a', status: 'maybe', owner: 'x' }),
        line({ at: '2026-01-04T01:04:00-05:00', job: 'a', status: 'ok' }),
        '[]',
        '',
        line({ at: '2026-01-04T01:05:00-05:00', job: 'a', status: 'ok', owner: 'x' }),
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-04');
    expect(night!.badLines).toBe(5);
    expect(night!.rows).toEqual([
      {
        job: 'a', owner: 'x', runs: 2, ok: 1, retries: 1, fail: 0, lastStatus: 'ok', lastError: 'boom',
        firstAt: '2026-01-04T01:00:00-05:00', lastAt: '2026-01-04T01:05:00-05:00',
      },
    ]);
  });

  it('invalid night: null, even if a matching file exists', () => {
    write('nope', line({ at: 't', job: 'a', status: 'ok', owner: null }));
    expect(readNight(dir, 'nope')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
    expect(readNight(dir, '2026-01-01x')).toBeNull();
  });
});
