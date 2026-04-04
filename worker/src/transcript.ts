// transcript.ts — YouTube transcript extraction via timedtext API
// Avoids both watch page scraping AND innertube /player API.
// Uses: timedtext API (caption list + transcript data) + oEmbed (title)

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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => HTML_ENTITIES[m] || m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ── Title via oEmbed (never rate-limited) ────────────────────────────

async function fetchTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json() as any;
      return data.title || `Video ${videoId}`;
    }
  } catch {
    // non-fatal
  }
  return `Video ${videoId}`;
}

// ── Timedtext API: list available caption tracks ─────────────────────

async function fetchCaptionList(videoId: string): Promise<LanguageTrack[]> {
  const res = await fetch(
    `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
    }
  );

  if (!res.ok) {
    throw new VideoError(`Failed to fetch caption list: ${res.status}`, 502);
  }

  const xml = await res.text();

  // Parse <track> elements from XML
  // Format: <track id="0" name="" lang_code="en" lang_original="English" lang_translated="English" lang_default="true" kind="asr"/>
  const tracks: LanguageTrack[] = [];
  const trackRegex = /<track\s+([^>]+)\/?\s*>/g;

  let match;
  while ((match = trackRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const langCode = getAttr(attrs, 'lang_code');
    const name = getAttr(attrs, 'lang_original') || getAttr(attrs, 'lang_translated') || langCode;
    const kind = getAttr(attrs, 'kind');

    if (langCode) {
      tracks.push({
        code: langCode,
        name: name || langCode,
        is_generated: kind === 'asr',
        is_translatable: true,
      });
    }
  }

  return tracks;
}

function getAttr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeHtmlEntities(match[1]) : '';
}

// ── Select the right language track ──────────────────────────────────

function selectTrack(tracks: LanguageTrack[], lang?: string | null): LanguageTrack {
  if (lang) {
    const exact = tracks.find((t) => t.code === lang);
    if (exact) return exact;
    const prefix = tracks.find((t) => t.code.startsWith(lang));
    if (prefix) return prefix;
  }

  const manualEn = tracks.find((t) => t.code.startsWith('en') && !t.is_generated);
  if (manualEn) return manualEn;
  const manual = tracks.find((t) => !t.is_generated);
  if (manual) return manual;
  return tracks[0];
}

// ── Timedtext API: fetch transcript data ─────────────────────────────

async function fetchTranscriptData(
  videoId: string,
  track: LanguageTrack
): Promise<TranscriptSegment[]> {
  const langParam = `lang=${encodeURIComponent(track.code)}`;
  const kindParam = track.is_generated ? '&kind=asr' : '';

  // Try JSON3 first
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&${langParam}${kindParam}&fmt=json3`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      }
    );
    if (res.ok) {
      const data = await res.json() as any;
      if (data.events) {
        const segments = parseJson3(data);
        if (segments.length > 0) return segments;
      }
    }
  } catch {
    // fall through to XML
  }

  // XML fallback
  const res = await fetch(
    `https://www.youtube.com/api/timedtext?v=${videoId}&${langParam}${kindParam}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
    }
  );
  if (!res.ok) {
    throw new VideoError(`Failed to fetch transcript data: ${res.status}`, 502);
  }
  const xml = await res.text();
  return parseTranscriptXml(xml);
}

function parseJson3(data: any): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const event of data.events || []) {
    if (!event.segs) continue;
    const text = event.segs
      .map((s: any) => s.utf8 || '')
      .join('')
      .trim();
    if (!text || text === '\n') continue;
    segments.push({
      text: decodeHtmlEntities(text),
      start: (event.tStartMs || 0) / 1000,
      duration: ((event.dDurationMs || 0) || 1000) / 1000,
    });
  }
  return segments;
}

function parseTranscriptXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const regex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;

  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeHtmlEntities(match[3].trim());
    if (!text) continue;
    segments.push({
      text,
      start: parseFloat(match[1]),
      duration: parseFloat(match[2]),
    });
  }

  if (segments.length === 0) {
    throw new VideoError('Transcript data was empty', 502);
  }
  return segments;
}

// ── Public API ───────────────────────────────────────────────────────

export async function fetchTranscript(
  videoId: string,
  language?: string | null
): Promise<TranscriptResult> {
  // Fetch title and caption list in parallel
  const [title, tracks] = await Promise.all([
    fetchTitle(videoId),
    fetchCaptionList(videoId),
  ]);

  if (tracks.length === 0) {
    throw new VideoError('No captions available for this video', 404);
  }

  const selected = selectTrack(tracks, language);
  const transcript = await fetchTranscriptData(videoId, selected);

  return {
    video_id: videoId,
    title,
    transcript,
    available_languages: tracks,
    selected_language: selected.code,
    backend: 'cloudflare-worker',
  };
}

export async function fetchLanguages(
  videoId: string
): Promise<{ video_id: string; title: string; available_languages: LanguageTrack[] }> {
  const [title, tracks] = await Promise.all([
    fetchTitle(videoId),
    fetchCaptionList(videoId),
  ]);

  if (tracks.length === 0) {
    throw new VideoError('No captions available for this video', 404);
  }

  return { video_id: videoId, title, available_languages: tracks };
}
