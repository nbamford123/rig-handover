import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestNotFound, DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const name = c.req.param('night');
    // Night names are dates; anything else can't be a file in runsDir.
    const night = /^\d{4}-\d{2}-\d{2}$/.test(name) ? readNight(config.runsDir, name) : null;
    if (!night) {
      return c.html(
        <Layout title={`digest ${name}`} lane={lane()}>
          <DigestNotFound night={name} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${name}`} lane={lane()}>
        <DigestPage night={night} />
      </Layout>,
    );
  });

  // Same reader, same order as the page (ADR 0001): agents read this one.
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const read = readNight(config.runsDir, night);
    if (!read) return c.json({ error: 'no such night', night }, 404);
    return c.json(read);
  });

  return app;
}
