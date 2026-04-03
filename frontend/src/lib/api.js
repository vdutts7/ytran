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
 * Fetch transcript from backend
 */
export const fetchTranscript = async (url, language = null) => {
  const response = await apiClient.post('/transcript', {
    url,
    language,
  });
  return response.data;
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
