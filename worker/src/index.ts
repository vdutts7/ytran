// index.ts — Cloudflare Worker entry point
// Routes: server-side transcript fetch + CORS proxy for client-side fallback

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { extractVideoId, fetchTranscript, fetchLanguages, VideoError } from './transcript';

const app = new Hono();

// ── CORS ─────────────────────────────────────────────────────────────

const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return 'https://ytran.pages.dev';
    if (origin.endsWith('.ytran.pages.dev') || origin === 'https://ytran.pages.dev') return origin;
    if (origin.startsWith('http://localhost:')) return origin;
    return 'https://ytran.pages.dev';
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
});

app.use('/api/*', corsMiddleware);

// ── Error handler ────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof VideoError) {
    return c.json({ detail: err.message }, err.status as any);
  }
  console.error('Unhandled error:', err);
  return c.json({ detail: 'Internal server error' }, 500);
});

// ── Routes ───────────────────────────────────────────────────────────

app.get('/api/', (c) => {
  return c.json({ message: 'ytranscript API is running', backend: 'cloudflare-worker' });
});

app.post('/api/transcript', async (c) => {
  const body = await c.req.json<{ url: string; language?: string | null }>();
  if (!body.url) return c.json({ detail: 'URL is required' }, 400);

  const videoId = extractVideoId(body.url);
  const result = await fetchTranscript(videoId, body.language);
  return c.json(result);
});

app.get('/api/languages/:videoId', async (c) => {
  const videoId = c.req.param('videoId');
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return c.json({ detail: 'Invalid video ID' }, 400);
  }
  const result = await fetchLanguages(videoId);
  return c.json(result);
});

// ── CORS proxy: browser fetches YouTube → Worker adds CORS headers ──
// Used as fallback when server-side strategies fail.
// Only proxies youtube.com / ytimg.com domains (security).

app.get('/api/proxy', corsMiddleware, async (c) => {
  const target = c.req.query('url');
  if (!target) return c.json({ detail: 'url param required' }, 400);

  // Security: only proxy YouTube domains
  let parsed: URL;
  try { parsed = new URL(target); } catch { return c.json({ detail: 'Invalid URL' }, 400); }

  const allowed = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com', 'i.ytimg.com'];
  if (!allowed.includes(parsed.hostname)) {
    return c.json({ detail: 'Only YouTube domains allowed' }, 403);
  }

  const res = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Return the response with CORS headers (handled by middleware)
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'text/plain',
      'Cache-Control': 'public, max-age=300',
    },
  });
});

export default app;
