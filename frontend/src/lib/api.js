import axios from 'axios';
import {
  parseYouTubeUrl,
  formatTimestamp,
  formatSrtTimestamp,
  formatVttTimestamp,
  buildTimestampUrl,
} from './youtube';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const apiClient = axios.create({
  baseURL: API,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Fetch transcript — tries server-side first, falls back to client-side via CORS proxy
 */
export const fetchTranscript = async (url, language = null) => {
  // Strategy 1: server-side (Worker fetches from YouTube directly)
  try {
    const response = await apiClient.post('/transcript', { url, language });
    return response.data;
  } catch (serverErr) {
    // If server returned a real error (400 invalid URL, etc.), don't retry client-side
    const status = serverErr.response?.status;
    if (status === 400) throw serverErr;
    // Otherwise fall through to client-side
  }

  // Strategy 2: client-side via CORS proxy (browser's IP → not blocked by YouTube)
  return fetchTranscriptClientSide(url, language);
};

/**
 * Client-side transcript extraction via CORS proxy
 * Browser fetches YouTube through Worker proxy (adds CORS headers).
 * YouTube sees the request from Worker IP, but timedtext/oembed endpoints
 * via the proxy may behave differently than the innertube API.
 */
const fetchTranscriptClientSide = async (url, language = null) => {
  const { videoId } = parseYouTubeUrl(url);
  if (!videoId) throw new Error('Invalid YouTube URL');

  const proxyUrl = (target) => `${API}/proxy?url=${encodeURIComponent(target)}`;

  // Fetch title + caption list in parallel
  const [titleData, trackListXml] = await Promise.all([
    axios.get(proxyUrl(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`))
      .then(r => r.data).catch(() => null),
    axios.get(proxyUrl(`https://www.youtube.com/api/timedtext?type=list&v=${videoId}`))
      .then(r => r.data).catch(() => null),
  ]);

  const title = titleData?.title || `Video ${videoId}`;

  // Parse track list XML
  const tracks = [];
  if (trackListXml) {
    const trackRegex = /<track\s+([^>]+)\/?\s*>/g;
    let match;
    while ((match = trackRegex.exec(trackListXml)) !== null) {
      const attrs = match[1];
      const code = getXmlAttr(attrs, 'lang_code');
      if (code) {
        tracks.push({
          code,
          name: getXmlAttr(attrs, 'lang_original') || getXmlAttr(attrs, 'lang_translated') || code,
          is_generated: getXmlAttr(attrs, 'kind') === 'asr',
          is_translatable: true,
        });
      }
    }
  }

  // If timedtext list failed, try scraping watch page through proxy
  if (tracks.length === 0) {
    const watchHtml = await axios.get(proxyUrl(`https://www.youtube.com/watch?v=${videoId}&hl=en`))
      .then(r => r.data).catch(() => null);

    if (watchHtml) {
      const playerMatch = watchHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
      if (playerMatch) {
        try {
          const player = JSON.parse(playerMatch[1]);
          const captionTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          for (const t of captionTracks) {
            tracks.push({
              code: t.languageCode,
              name: t.name?.simpleText || t.languageCode,
              is_generated: t.kind === 'asr',
              is_translatable: true,
              _baseUrl: t.baseUrl,
            });
          }
        } catch {}
      }
    }
  }

  if (tracks.length === 0) {
    throw { response: { status: 404, data: { detail: 'No captions available for this video' } } };
  }

  // Select track
  let selected = null;
  if (language) {
    selected = tracks.find(t => t.code === language) || tracks.find(t => t.code.startsWith(language));
  }
  if (!selected) {
    selected = tracks.find(t => t.code.startsWith('en') && !t.is_generated)
      || tracks.find(t => !t.is_generated)
      || tracks[0];
  }

  // Fetch transcript data
  let transcript = null;
  const kindParam = selected.is_generated ? '&kind=asr' : '';

  if (selected._baseUrl) {
    // From watch page scrape — use baseUrl directly
    transcript = await fetchTranscriptFromUrl(proxyUrl(selected._baseUrl + '&fmt=json3'));
    if (!transcript) transcript = await fetchTranscriptFromUrl(proxyUrl(selected._baseUrl));
  }

  if (!transcript) {
    // From timedtext API
    const ttUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(selected.code)}${kindParam}`;
    transcript = await fetchTranscriptFromUrl(proxyUrl(ttUrl + '&fmt=json3'));
    if (!transcript) transcript = await fetchTranscriptFromUrl(proxyUrl(ttUrl));
  }

  if (!transcript || transcript.length === 0) {
    throw { response: { status: 502, data: { detail: 'Failed to fetch transcript data' } } };
  }

  return {
    video_id: videoId,
    title,
    transcript,
    available_languages: tracks.map(({ _baseUrl, ...rest }) => rest),
    selected_language: selected.code,
    backend: 'cloudflare-worker-proxy',
  };
};

const fetchTranscriptFromUrl = async (url) => {
  try {
    const r = await axios.get(url, { timeout: 15000 });
    const data = r.data;
    // JSON3 format
    if (data?.events) {
      return data.events
        .filter(e => e.segs)
        .map(e => ({
          text: e.segs.map(s => s.utf8 || '').join('').trim(),
          start: (e.tStartMs || 0) / 1000,
          duration: ((e.dDurationMs || 0) || 1000) / 1000,
        }))
        .filter(s => s.text && s.text !== '\n');
    }
    // XML format
    if (typeof data === 'string' && data.includes('<text')) {
      const segments = [];
      const re = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
      let m;
      while ((m = re.exec(data)) !== null) {
        const text = decodeXmlEntities(m[3].trim());
        if (text) segments.push({ text, start: parseFloat(m[1]), duration: parseFloat(m[2]) });
      }
      return segments.length > 0 ? segments : null;
    }
    return null;
  } catch { return null; }
};

const decodeXmlEntities = (text) =>
  text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

const getXmlAttr = (attrs, name) => {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeXmlEntities(m[1]) : '';
};

/**
 * Fetch video metadata using oEmbed (no API key needed)
 */
export const fetchVideoMetadata = async (videoId) => {
  try {
    const response = await axios.get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { timeout: 5000 }
    );
    return {
      title: response.data.title,
      author: response.data.author_name,
      authorUrl: response.data.author_url,
      thumbnailUrl: response.data.thumbnail_url,
    };
  } catch {
    return null;
  }
};

/**
 * Clean transcript text - remove [Music], [Applause], etc.
 */
export const cleanTranscriptText = (text) => {
  return text
    // Remove bracketed annotations
    .replace(/\[.*?\]/g, '')
    // Remove parenthesized annotations
    .replace(/\(.*?\)/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Generate plain text content
 */
export const generateTxtContent = (transcript, options = {}) => {
  const { showTimestamps = true, cleanMode = false } = options;
  
  return transcript
    .map((line) => {
      const text = cleanMode ? cleanTranscriptText(line.text) : line.text;
      if (!text) return null;
      
      if (showTimestamps) {
        return `[${formatTimestamp(line.start)}] ${text}`;
      }
      return text;
    })
    .filter(Boolean)
    .join('\n');
};

/**
 * Generate SRT subtitle content
 */
export const generateSrtContent = (transcript, cleanMode = false) => {
  return transcript
    .map((line, index) => {
      const text = cleanMode ? cleanTranscriptText(line.text) : line.text;
      if (!text) return null;
      
      const startTime = formatSrtTimestamp(line.start);
      const endTime = formatSrtTimestamp(line.start + line.duration);
      return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
    })
    .filter(Boolean)
    .join('\n');
};

/**
 * Generate VTT subtitle content
 */
export const generateVttContent = (transcript, cleanMode = false) => {
  const lines = transcript
    .map((line) => {
      const text = cleanMode ? cleanTranscriptText(line.text) : line.text;
      if (!text) return null;
      
      const startTime = formatVttTimestamp(line.start);
      const endTime = formatVttTimestamp(line.start + line.duration);
      return `${startTime} --> ${endTime}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
  
  return `WEBVTT\n\n${lines}`;
};

/**
 * Generate JSON export content
 */
export const generateJsonContent = (transcript, metadata = {}) => {
  return JSON.stringify({
    metadata: {
      videoId: metadata.videoId,
      title: metadata.title,
      author: metadata.author,
      language: metadata.language,
      segmentCount: transcript.length,
      exportedAt: new Date().toISOString(),
    },
    transcript: transcript.map((line) => ({
      start: line.start,
      duration: line.duration,
      text: line.text,
    })),
  }, null, 2);
};

/**
 * Generate Markdown content with timestamp links
 */
export const generateMarkdownContent = (transcript, metadata = {}, cleanMode = false) => {
  const { videoId, title, author } = metadata;
  
  const header = [
    `# ${title || 'YouTube Transcript'}`,
    author ? `**Channel:** ${author}` : '',
    videoId ? `**Video:** https://www.youtube.com/watch?v=${videoId}` : '',
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');
  
  const content = transcript
    .map((line) => {
      const text = cleanMode ? cleanTranscriptText(line.text) : line.text;
      if (!text) return null;
      
      const timestamp = formatTimestamp(line.start);
      const link = videoId ? buildTimestampUrl(videoId, line.start) : null;
      
      if (link) {
        return `**[${timestamp}](${link})** ${text}`;
      }
      return `**${timestamp}** ${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
  
  return header + content;
};

/**
 * Download file with auto-generated filename
 */
export const downloadFile = (content, filename, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Sanitize filename from video title
 */
export const sanitizeFilename = (title) => {
  return title
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 60);
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
};

export { formatTimestamp, parseYouTubeUrl };
export default apiClient;
