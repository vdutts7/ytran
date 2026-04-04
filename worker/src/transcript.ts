// transcript.ts — YouTube transcript extraction via innertube API
// No HTML scraping. No yt-dlp. No Python. Uses YouTube's internal JSON API.

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

// ── Innertube API client context ─────────────────────────────────────

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // public, embedded in every YouTube page

// Multiple client configs — try in order until one works
const INNERTUBE_CLIENTS = [
  {
    name: 'ANDROID',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
    },
  },
  {
    name: 'IOS',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '19.09.3',
        deviceModel: 'iPhone14,3',
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
    },
  },
  {
    name: 'WEB',
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240313.05.00',
        hl: 'en',
        gl: 'US',
      },
    },
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20240313.05.00',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
    },
  },
];

// ── Fetch player response via innertube /player ──────────────────────

async function fetchPlayerResponse(videoId: string): Promise<any> {
  let lastStatus = 0;
  let lastError: VideoError | null = null;

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`,
        {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({
            context: client.context,
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
        }
      );

      lastStatus = res.status;
      if (!res.ok) continue;

      const data = await res.json() as any;

      // Check for playability errors
      const status = data?.playabilityStatus;

      // ERROR = video truly doesn't exist — fatal, no point trying other clients
      if (status?.status === 'ERROR') {
        throw new VideoError(status.reason || 'Video not found', 404);
      }

      // UNPLAYABLE / LOGIN_REQUIRED — this client can't play it, try next
      if (status?.status === 'UNPLAYABLE' || status?.status === 'LOGIN_REQUIRED') {
        lastError = new VideoError(
          status.reason || status.messages?.[0] || 'Video is unavailable',
          status.status === 'LOGIN_REQUIRED' ? 403 : 404
        );
        continue;
      }

      // Check if we actually got captions
      if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
        return data;
      }

      // Got a response but no captions — try next client, maybe they have them
      if (client === INNERTUBE_CLIENTS[INNERTUBE_CLIENTS.length - 1]) {
        return data; // last client — return what we have (will throw "no captions" later)
      }
    } catch (e) {
      if (e instanceof VideoError) throw e; // propagate fatal errors (ERROR status)
      continue; // network error, try next client
    }
  }

  // All clients failed
  if (lastError) throw lastError;
  throw new VideoError(`YouTube API returned ${lastStatus} for all client types`, 502);
}

// ── Extract caption tracks from player response ──────────────────────

function extractCaptionTracks(playerResponse: any): LanguageTrack[] {
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
  if (!captions?.captionTracks?.length) {
    throw new VideoError('No captions available for this video', 404);
  }

  return captions.captionTracks.map((track: any) => {
    let baseUrl = track.baseUrl || '';
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
    const exact = tracks.find((t) => t.code === lang);
    if (exact) return exact;
    const prefix = tracks.find((t) => t.code.startsWith(lang));
    if (prefix) return prefix;
  }

  // Prefer manual English > any manual > first auto-generated
  const manualEn = tracks.find((t) => t.code.startsWith('en') && !t.is_generated);
  if (manualEn) return manualEn;
  const manual = tracks.find((t) => !t.is_generated);
  if (manual) return manual;
  return tracks[0];
}

// ── Fetch & parse transcript from caption track URL ──────────────────

async function fetchTranscriptData(baseUrl: string): Promise<TranscriptSegment[]> {
  // Try JSON3 format first (structured, reliable)
  const json3Url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';

  try {
    const res = await fetch(json3Url);
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
  const res = await fetch(baseUrl);
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

  const title =
    playerResponse?.videoDetails?.title ||
    playerResponse?.microformat?.playerMicroformatRenderer?.title?.simpleText ||
    `Video ${videoId}`;

  const tracks = extractCaptionTracks(playerResponse);
  const selected = selectTrack(tracks, language);
  const transcript = await fetchTranscriptData(selected.baseUrl);

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
