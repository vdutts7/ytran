// index.ts — Cloudflare Worker entry point
// Hono API matching existing frontend contract (POST /api/transcript, etc.)

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { extractVideoId, fetchTranscript, fetchLanguages, VideoError } from './transcript';

const app = new Hono();

// ── CORS ─────────────────────────────────────────────────────────────

app.use('/api/*', cors({
  origin: [
    'https://ytran.pages.dev',
    'http://localhost:3000',
    'http://localhost:8788',
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

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

  if (!body.url) {
    return c.json({ detail: 'URL is required' }, 400);
  }

  const videoId = extractVideoId(body.url); // throws VideoError(400) on invalid
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

export default app;
