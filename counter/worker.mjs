import { DurableObject } from 'cloudflare:workers';
import { render } from './render.mjs';

export class Visits extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      count INTEGER NOT NULL CHECK (count BETWEEN 0 AND 9007199254740991)
    )`);
  }

  current() {
    return this.ctx.storage.sql.exec('SELECT count FROM visits WHERE id = 1').toArray()[0]?.count ?? 0;
  }

  hit() {
    // A single SQLite statement also handles simultaneous image requests safely.
    return this.ctx.storage.sql.exec(`INSERT INTO visits (id, count) VALUES (1, 1)
      ON CONFLICT(id) DO UPDATE SET count = count + 1 RETURNING count`).one().count;
  }
}

const headers = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
};
const imageHeaders = { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const image = url.pathname === '/side.svg' || url.pathname === '/side-mobile.svg';
    if (!image && url.pathname !== '/count' && url.pathname !== '/health') {
      return new Response('Not found', { status: 404, headers });
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
    }
    if (url.search && (!image || url.search !== '?preview=1')) {
      return new Response('Invalid query', { status: 400, headers });
    }
    if (request.method === 'HEAD') {
      return new Response(null, { headers: image ? imageHeaders : headers });
    }
    if (url.pathname === '/health') return new Response('ok', { headers });

    try {
      const counter = env.VISITS.getByName('snowsadh');
      if (url.pathname === '/count') {
        return Response.json({ count: await counter.current() }, { headers });
      }
      // Load the original self-contained SVG before counting; no external image/font dependencies.
      const asset = await env.ARTWORK.fetch(new URL(url.pathname, 'https://artwork.local'));
      if (!asset.ok) throw new Error('Artwork unavailable');
      const artwork = await asset.text();
      const count = await (url.search ? counter.current() : counter.hit());
      return new Response(render(artwork, count), { headers: imageHeaders });
    } catch {
      // Never show an invented count or expose database/runtime errors to visitors.
      return new Response('Counter temporarily unavailable', { status: 503, headers });
    }
  },
};
