// transcript.ts — YouTube transcript extraction
// Three strategies tried in parallel, first success wins:
//   1. Timedtext API (direct, lightweight)
//   2. Innertube /player API (ANDROID client)
//   3. Watch page HTML scrape (classic)

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface LanguageTrack {
  code: string;
  name: string;
  is_generated: boolean;
  is_translatable: boolean;
}

interface InternalTrack extends LanguageTrack {
  baseUrl?: string;
}

export interface TranscriptResult {
  video_id: string;
  title: string;
  transcript: TranscriptSegment[];
  available_languages: LanguageTrack[];
  selected_language: string;
  backend: string;
}

// ── Video ID extraction ──────────────────────────────────────────────

const VIDEO_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/|music\.youtube\.com\/watch\?.*v=|m\.youtube\.com\/watch\?.*v=|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /^([a-zA-Z0-9_-]{11})$/,
];

export function extractVideoId(url: string): string {
  const trimmed = url.trim();
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  throw new VideoError('Invalid YouTube URL or video ID', 400);
}

// ── Errors ───────────────────────────────────────────────────────────

export class VideoError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// ── HTML entity decoding ─────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

function decodeHtml(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => HTML_ENTITIES[m] || m)
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ── Title via oEmbed (never rate-limited) ────────────────────────────

async function fetchTitle(videoId: string): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (r.ok) { const d = await r.json() as any; return d.title || `Video ${videoId}`; }
  } catch {}
  return `Video ${videoId}`;
}

// ══════════════════════════════════════════════════════════════════════
// STRATEGY 1: Timedtext API
// ══════════════════════════════════════════════════════════════════════

async function strategy1_timedtext(videoId: string, lang?: string | null): Promise<{ tracks: InternalTrack[]; selected: InternalTrack; transcript: TranscriptSegment[] } | null> {
  try {
    const listRes = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${videoId}`, {
      headers: { 'User-Agent': UA },
    });
    if (!listRes.ok) return null;

    const xml = await listRes.text();
    const tracks = parseTrackListXml(xml);
    if (tracks.length === 0) return null;

    const selected = selectTrack(tracks, lang);
    const kindParam = selected.is_generated ? '&kind=asr' : '';

    // Try json3 then xml
    let transcript = await fetchTimedtext(videoId, selected.code, kindParam, 'json3');
    if (!transcript) transcript = await fetchTimedtext(videoId, selected.code, kindParam, 'xml');
    if (!transcript || transcript.length === 0) return null;

    return { tracks, selected, transcript };
  } catch { return null; }
}

function parseTrackListXml(xml: string): InternalTrack[] {
  const tracks: InternalTrack[] = [];
  const re = /<track\s+([^>]+)\/?\s*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const a = m[1];
    const code = attr(a, 'lang_code');
    if (code) {
      tracks.push({
        code,
        name: attr(a, 'lang_original') || attr(a, 'lang_translated') || code,
        is_generated: attr(a, 'kind') === 'asr',
        is_translatable: true,
      });
    }
  }
  return tracks;
}

async function fetchTimedtext(videoId: string, lang: string, kindParam: string, fmt: string): Promise<TranscriptSegment[] | null> {
  try {
    const fmtParam = fmt === 'json3' ? '&fmt=json3' : '';
    const r = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(lang)}${kindParam}${fmtParam}`, {
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return null;
    if (fmt === 'json3') {
      const d = await r.json() as any;
      return d.events ? parseJson3(d) : null;
    } else {
      return parseXmlTranscript(await r.text());
    }
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// STRATEGY 2: Innertube /player (try ANDROID, IOS, WEB)
// ══════════════════════════════════════════════════════════════════════

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const CLIENTS = [
  { name: 'ANDROID', ctx: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' }, ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip' },
  { name: 'IOS', ctx: { clientName: 'IOS', clientVersion: '19.09.3', deviceModel: 'iPhone14,3', hl: 'en', gl: 'US' }, ua: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)' },
  { name: 'WEB', ctx: { clientName: 'WEB', clientVersion: '2.20240313.05.00', hl: 'en', gl: 'US' }, ua: UA },
];

async function strategy2_innertube(videoId: string, lang?: string | null): Promise<{ tracks: InternalTrack[]; selected: InternalTrack; transcript: TranscriptSegment[] } | null> {
  for (const client of CLIENTS) {
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': client.ua },
        body: JSON.stringify({ context: { client: client.ctx }, videoId, contentCheckOk: true, racyCheckOk: true }),
      });
      if (!r.ok) continue;
      const data = await r.json() as any;
      const ps = data?.playabilityStatus?.status;
      // Only skip on hard ERROR (video doesn't exist). UNPLAYABLE/LOGIN_REQUIRED
      // may still have captions in the response — check before giving up.
      if (ps === 'ERROR') continue;

      const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!captionTracks?.length) continue; // no captions with this client, try next

      const tracks: InternalTrack[] = captionTracks.map((t: any) => ({
        code: t.languageCode,
        name: t.name?.simpleText || t.languageCode,
        is_generated: t.kind === 'asr',
        is_translatable: true,
        baseUrl: (t.baseUrl || '').replace(/^\/\//, 'https://'),
      }));

      const selected = selectTrack(tracks, lang);
      if (!selected.baseUrl) continue;

      // Fetch transcript from the baseUrl
      let transcript: TranscriptSegment[] | null = null;
      try {
        const tr = await fetch(selected.baseUrl + '&fmt=json3');
        if (tr.ok) { const d = await tr.json() as any; if (d.events) transcript = parseJson3(d); }
      } catch {}
      if (!transcript) {
        try {
          const tr = await fetch(selected.baseUrl);
          if (tr.ok) transcript = parseXmlTranscript(await tr.text());
        } catch {}
      }
      if (!transcript || transcript.length === 0) continue;

      return { tracks, selected, transcript };
    } catch { continue; }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// STRATEGY 3: Watch page HTML scrape
// ══════════════════════════════════════════════════════════════════════

async function strategy3_watchpage(videoId: string, lang?: string | null): Promise<{ tracks: InternalTrack[]; selected: InternalTrack; transcript: TranscriptSegment[] } | null> {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!r.ok) return null;
    const html = await r.text();

    // Extract ytInitialPlayerResponse
    let playerData: any = null;
    for (const pat of [/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s, /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s]) {
      const m = html.match(pat);
      if (m?.[1]) { try { playerData = JSON.parse(m[1]); break; } catch {} }
    }
    if (!playerData) return null;

    const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks?.length) return null;

    const tracks: InternalTrack[] = captionTracks.map((t: any) => ({
      code: t.languageCode,
      name: t.name?.simpleText || t.languageCode,
      is_generated: t.kind === 'asr',
      is_translatable: true,
      baseUrl: (t.baseUrl || '').replace(/^\/\//, 'https://'),
    }));

    const selected = selectTrack(tracks, lang);
    if (!selected.baseUrl) return null;

    let transcript: TranscriptSegment[] | null = null;
    try {
      const tr = await fetch(selected.baseUrl + '&fmt=json3');
      if (tr.ok) { const d = await tr.json() as any; if (d.events) transcript = parseJson3(d); }
    } catch {}
    if (!transcript) {
      try {
        const tr = await fetch(selected.baseUrl);
        if (tr.ok) transcript = parseXmlTranscript(await tr.text());
      } catch {}
    }
    if (!transcript || transcript.length === 0) return null;

    return { tracks, selected, transcript };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// Shared parsers + helpers
// ══════════════════════════════════════════════════════════════════════

function attr(s: string, name: string): string {
  const m = s.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeHtml(m[1]) : '';
}

function selectTrack(tracks: InternalTrack[], lang?: string | null): InternalTrack {
  if (lang) {
    const exact = tracks.find((t) => t.code === lang);
    if (exact) return exact;
    const pfx = tracks.find((t) => t.code.startsWith(lang));
    if (pfx) return pfx;
  }
  return tracks.find((t) => t.code.startsWith('en') && !t.is_generated)
    || tracks.find((t) => !t.is_generated)
    || tracks[0];
}

function parseJson3(data: any): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const ev of data.events || []) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s: any) => s.utf8 || '').join('').trim();
    if (!text || text === '\n') continue;
    out.push({ text: decodeHtml(text), start: (ev.tStartMs || 0) / 1000, duration: ((ev.dDurationMs || 0) || 1000) / 1000 });
  }
  return out;
}

function parseXmlTranscript(xml: string): TranscriptSegment[] | null {
  const out: TranscriptSegment[] = [];
  const re = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const text = decodeHtml(m[3].trim());
    if (text) out.push({ text, start: parseFloat(m[1]), duration: parseFloat(m[2]) });
  }
  return out.length > 0 ? out : null;
}

// ══════════════════════════════════════════════════════════════════════
// Public API — race all 3 strategies, first success wins
// ══════════════════════════════════════════════════════════════════════

export async function fetchTranscript(
  videoId: string,
  language?: string | null
): Promise<TranscriptResult> {
  // Fire all strategies + title fetch in parallel
  const [title, s1, s2, s3] = await Promise.all([
    fetchTitle(videoId),
    strategy1_timedtext(videoId, language),
    strategy2_innertube(videoId, language),
    strategy3_watchpage(videoId, language),
  ]);

  // Take the first one that worked
  const result = s1 || s2 || s3;

  if (!result) {
    throw new VideoError('No captions available for this video. All extraction methods failed.', 404);
  }

  return {
    video_id: videoId,
    title,
    transcript: result.transcript,
    available_languages: result.tracks.map(({ baseUrl: _, ...rest }: any) => rest),
    selected_language: result.selected.code,
    backend: 'cloudflare-worker',
  };
}

export async function fetchLanguages(
  videoId: string
): Promise<{ video_id: string; title: string; available_languages: LanguageTrack[] }> {
  const [title, s1, s2, s3] = await Promise.all([
    fetchTitle(videoId),
    strategy1_timedtext(videoId),
    strategy2_innertube(videoId),
    strategy3_watchpage(videoId),
  ]);

  const result = s1 || s2 || s3;
  if (!result) {
    throw new VideoError('No captions available for this video', 404);
  }

  return {
    video_id: videoId,
    title,
    available_languages: result.tracks.map(({ baseUrl: _, ...rest }: any) => rest),
  };
}
