import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

let tempDir: string = '';
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

function createConfig() {
  return { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: tempDir };
}

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rig-test-'));

  // 2026-01-01.jsonl: good night with 2 jobs
  // Job 1: owner null
  // Job 2: 3 retries, then ok, then fail
  const lines2026_01_01 = [
    { at: '2026-01-01T06:00:00+01:00', job: 'a/backend', status: 'ok', owner: null },
    { at: '2026-01-01T06:01:00+01:00', job: 'b/frontend', status: 'retry', owner: 'alice@example.com' },
    { at: '2026-01-01T06:02:00+01:00', job: 'b/frontend', status: 'retry', owner: 'alice@example.com' },
    { at: '2026-01-01T06:03:00+01:00', job: 'b/frontend', status: 'retry', owner: 'alice@example.com' },
    { at: '2026-01-01T06:04:00+01:00', job: 'b/frontend', status: 'ok', owner: 'alice@example.com' },
    { at: '2026-01-01T06:05:00+01:00', job: 'b/frontend', status: 'fail', owner: 'alice@example.com', error: 'timeout' },
  ];
  writeFileSync(join(tempDir, '2026-01-01.jsonl'), lines2026_01_01.map((l) => JSON.stringify(l)).join('\n') + '\n');

  // 2026-01-02.jsonl: empty file
  writeFileSync(join(tempDir, '2026-01-02.jsonl'), '');

  // 2026-01-03.jsonl: one good line and one line that doesn't parse
  const lines2026_01_03 = [
    { at: '2026-01-03T07:00:00+01:00', job: 'c/worker', status: 'ok', owner: 'bob@example.com' },
    '{"at":"2026-01-03T07:01:00+01:00","job":"d/scheduler","sta', // incomplete line
  ];
  writeFileSync(join(tempDir, '2026-01-03.jsonl'), lines2026_01_03.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');

  // No file for 2026-01-04
  config = createConfig();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('digest routes', () => {
  describe('GET /digest/:night (page)', () => {
    it('returns 200 for 2026-01-01 and contains job names', async () => {
      const res = await createApp(config).request('/digest/2026-01-01');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('a/backend');
      expect(html).toContain('b/frontend');
    });

    it('returns 200 for 2026-01-02 and contains "nothing ran"', async () => {
      const res = await createApp(config).request('/digest/2026-01-02');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('nothing ran');
    });

    it('returns 200 for 2026-01-03 and contains the good job name', async () => {
      const res = await createApp(config).request('/digest/2026-01-03');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('c/worker');
    });

    it('returns 404 for 2026-01-04 (no file)', async () => {
      const res = await createApp(config).request('/digest/2026-01-04');
      expect(res.status).toBe(404);
    });

    it('renders null owner as —', async () => {
      const res = await createApp(config).request('/digest/2026-01-01');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('—');
    });
  });

  describe('GET /api/digest/:night (JSON)', () => {
    it('returns 200 for 2026-01-01 with rows sorted by job and badLines: 0', async () => {
      const res = await createApp(config).request('/api/digest/2026-01-01');
      expect(res.status).toBe(200);
      const data = await res.json() as { rows: Array<{ job: string; owner: string | null; runs: number; ok: number; retries: number; fail: number; lastStatus: string; lastError: string | null; firstAt: string; lastAt: string }>; badLines: number };
      expect(data.badLines).toBe(0);
      expect(data.rows).toHaveLength(2);
      expect(data.rows[0].job).toBe('a/backend');
      expect(data.rows[1].job).toBe('b/frontend');
      expect(data.rows[0].owner).toBeNull();
      expect(data.rows[1].owner).toBe('alice@example.com');
    });

    it('returns 200 for 2026-01-02 with empty rows', async () => {
      const res = await createApp(config).request('/api/digest/2026-01-02');
      expect(res.status).toBe(200);
      const data = await res.json() as { rows: unknown[]; badLines: number };
      expect(data.rows).toEqual([]);
      expect(data.badLines).toBe(0);
    });

    it('returns 200 for 2026-01-03 with 1 row and badLines: 1', async () => {
      const res = await createApp(config).request('/api/digest/2026-01-03');
      expect(res.status).toBe(200);
      const data = await res.json() as { rows: Array<{ job: string }>; badLines: number };
      expect(data.rows).toHaveLength(1);
      expect(data.rows[0].job).toBe('c/worker');
      expect(data.badLines).toBe(1);
    });

    it('returns 404 for 2026-01-04 (no file)', async () => {
      const res = await createApp(config).request('/api/digest/2026-01-04');
      expect(res.status).toBe(404);
    });
  });

  describe('page and JSON agreement for 2026-01-01', () => {
    it('job names appear in page in same order as JSON rows', async () => {
      const pageRes = await createApp(config).request('/digest/2026-01-01');
      const jsonRes = await createApp(config).request('/api/digest/2026-01-01');

      const html = await pageRes.text();
      const data = await jsonRes.json() as { rows: Array<{ job: string }> };

      const jobsInJson = data.rows.map((r) => r.job);
      for (const job of jobsInJson) {
        expect(html).toContain(job);
      }

      // Check that jobs appear in the same order in the HTML
      const firstJobIndex = html.indexOf(jobsInJson[0]);
      const secondJobIndex = html.indexOf(jobsInJson[1]);
      expect(firstJobIndex).toBeLessThan(secondJobIndex);
    });
  });
});
