// transcript.ts — YouTube transcript extraction via fetch + HTML/XML parse
// No dependencies. No yt-dlp. No Python. Pure fetch → parse.

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
  baseUrl: string;
}

export interface TranscriptResult {
  video_id: string;
  title: string;
  transcript: TranscriptSegment[];
  available_languages: Omit<LanguageTrack, 'baseUrl'>[];
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

// ── Fetch YouTube watch page & extract player response ───────────────

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchPlayerResponse(videoId: string): Promise<any> {
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new VideoError(`YouTube returned ${res.status}`, 502);

  const html = await res.text();

  // Try multiple extraction patterns
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]);
      } catch {
        continue;
      }
    }
  }

  // Check for known error states in HTML
  if (html.includes('Sign in to confirm your age') || html.includes('age-restricted')) {
    throw new VideoError('This video is age-restricted and requires sign-in', 403);
  }
  if (html.includes('Video unavailable') || html.includes('is not available')) {
    throw new VideoError('Video not found or unavailable', 404);
  }

  throw new VideoError('Could not extract video data from YouTube page', 502);
}

// ── Extract caption tracks from player response ──────────────────────

function extractCaptionTracks(playerResponse: any): LanguageTrack[] {
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
  if (!captions?.captionTracks?.length) {
    throw new VideoError('No captions available for this video', 404);
  }

  return captions.captionTracks.map((track: any) => {
    let baseUrl = track.baseUrl || '';
    // Fix protocol-relative URLs
    if (baseUrl.startsWith('//')) baseUrl = 'https:' + baseUrl;

    return {
      code: track.languageCode,
      name: track.name?.simpleText || track.languageCode,
      is_generated: track.kind === 'asr',
      is_translatable: (captions.translationLanguages?.length || 0) > 0,
      baseUrl,
    };
  });
}

// ── Select the right language track ──────────────────────────────────

function selectTrack(tracks: LanguageTrack[], lang?: string | null): LanguageTrack {
  if (lang) {
    // Exact match
    const exact = tracks.find((t) => t.code === lang);
    if (exact) return exact;
    // Prefix match (e.g. 'en' matches 'en-US')
    const prefix = tracks.find((t) => t.code.startsWith(lang));
    if (prefix) return prefix;
  }

  // Prefer manual English
  const manualEn = tracks.find((t) => t.code.startsWith('en') && !t.is_generated);
  if (manualEn) return manualEn;

  // Any manual track
  const manual = tracks.find((t) => !t.is_generated);
  if (manual) return manual;

  // First available (auto-generated)
  return tracks[0];
}

// ── Fetch & parse transcript XML ─────────────────────────────────────

async function fetchTranscriptXml(baseUrl: string): Promise<TranscriptSegment[]> {
  // Request JSON3 format first (structured), fall back to XML
  const json3Url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';

  try {
    const res = await fetch(json3Url, { headers: BROWSER_HEADERS });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.events) {
        return parseJson3(data);
      }
    }
  } catch {
    // Fall through to XML
  }

  // XML fallback
  const res = await fetch(baseUrl, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new VideoError(`Failed to fetch transcript data: ${res.status}`, 502);
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
  const playerResponse = await fetchPlayerResponse(videoId);

  // Title
  const title =
    playerResponse?.videoDetails?.title ||
    playerResponse?.microformat?.playerMicroformatRenderer?.title?.simpleText ||
    `Video ${videoId}`;

  // Captions
  const tracks = extractCaptionTracks(playerResponse);
  const selected = selectTrack(tracks, language);

  // Fetch transcript
  const transcript = await fetchTranscriptXml(selected.baseUrl);

  return {
    video_id: videoId,
    title: decodeHtmlEntities(title),
    transcript,
    available_languages: tracks.map(({ baseUrl: _, ...rest }) => rest),
    selected_language: selected.code,
    backend: 'cloudflare-worker',
  };
}

export async function fetchLanguages(
  videoId: string
): Promise<{ video_id: string; title: string; available_languages: Omit<LanguageTrack, 'baseUrl'>[] }> {
  const playerResponse = await fetchPlayerResponse(videoId);

  const title =
    playerResponse?.videoDetails?.title ||
    `Video ${videoId}`;

  const tracks = extractCaptionTracks(playerResponse);

  return {
    video_id: videoId,
    title: decodeHtmlEntities(title),
    available_languages: tracks.map(({ baseUrl: _, ...rest }) => rest),
  };
}
