/**
 * Bulletproof YouTube URL Normalization
 * Handles all YouTube URL formats and extracts video ID + timestamp
 */

// All YouTube URL patterns
const YOUTUBE_PATTERNS = [
  // Standard watch URLs
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  // Short URLs
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  // Embed URLs
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  // Shorts URLs
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  // Live URLs
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  // Old /v/ format
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  // YouTube Music
  /(?:https?:\/\/)?music\.youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  // Mobile YouTube
  /(?:https?:\/\/)?m\.youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  // YouTube No Cookie
  /(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  // Attribution link (has redirect)
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/attribution_link\?.*v(?:=|%3D)([a-zA-Z0-9_-]{11})/,
  // Raw video ID (11 characters)
  /^([a-zA-Z0-9_-]{11})$/,
];

// Junk query params to strip
const JUNK_PARAMS = [
  'si', 'pp', 'ab_channel', 'feature', 'list', 'index', 
  'start_radio', 'playnext', 'app', 'cbrd', 'cbr', 'utm_source',
  'utm_medium', 'utm_campaign', 'ref', 'share'
];

/**
 * Parse timestamp from various formats
 * @param {string} timestamp - Timestamp string (30, 30s, 1m30s, 1h2m30s)
 * @returns {number|null} - Seconds or null
 */
export const parseTimestamp = (timestamp) => {
  if (!timestamp) return null;
  
  // Already a number
  if (/^\d+$/.test(timestamp)) {
    return parseInt(timestamp, 10);
  }
  
  // Format: 30s
  if (/^\d+s$/.test(timestamp)) {
    return parseInt(timestamp, 10);
  }
  
  // Format: 1m30s or 1m
  const minSecMatch = timestamp.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (minSecMatch) {
    const hours = parseInt(minSecMatch[1] || '0', 10);
    const minutes = parseInt(minSecMatch[2] || '0', 10);
    const seconds = parseInt(minSecMatch[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return null;
};

/**
 * Extract video ID and timestamp from any YouTube URL
 * @param {string} input - URL or video ID
 * @returns {{ videoId: string|null, timestamp: number|null, error: string|null }}
 */
export const parseYouTubeUrl = (input) => {
  if (!input || typeof input !== 'string') {
    return { videoId: null, timestamp: null, error: 'No input provided' };
  }
  
  const trimmed = input.trim();
  
  // Try each pattern
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const videoId = match[1];
      
      // Extract timestamp from URL
      let timestamp = null;
      try {
        // Parse URL for timestamp params
        const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        const tParam = urlObj.searchParams.get('t') || urlObj.searchParams.get('start');
        if (tParam) {
          timestamp = parseTimestamp(tParam);
        }
      } catch {
        // URL parsing failed, check for t= in string
        const tMatch = trimmed.match(/[?&]t=([^&]+)/);
        if (tMatch) {
          timestamp = parseTimestamp(tMatch[1]);
        }
      }
      
      return { videoId, timestamp, error: null };
    }
  }
  
  return { videoId: null, timestamp: null, error: 'Invalid YouTube URL or video ID' };
};

/**
 * Normalize YouTube URL to canonical format
 * @param {string} input - Any YouTube URL format
 * @returns {string|null} - Canonical URL or null
 */
export const normalizeYouTubeUrl = (input) => {
  const { videoId, timestamp } = parseYouTubeUrl(input);
  if (!videoId) return null;
  
  let url = `https://www.youtube.com/watch?v=${videoId}`;
  if (timestamp) {
    url += `&t=${timestamp}`;
  }
  return url;
};

/**
 * Build URL to open video at specific timestamp
 * @param {string} videoId - Video ID
 * @param {number} seconds - Timestamp in seconds
 * @returns {string} - YouTube URL with timestamp
 */
export const buildTimestampUrl = (videoId, seconds) => {
  const rounded = Math.floor(seconds);
  return `https://www.youtube.com/watch?v=${videoId}&t=${rounded}s`;
};

/**
 * Get thumbnail URLs with fallback chain
 * @param {string} videoId - Video ID
 * @returns {string[]} - Array of thumbnail URLs in priority order
 */
export const getThumbnailUrls = (videoId) => {
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/default.jpg`,
  ];
};

/**
 * Check if input looks like a YouTube URL
 * @param {string} input - Input string
 * @returns {boolean}
 */
export const looksLikeYouTubeUrl = (input) => {
  if (!input) return false;
  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.includes('youtube.com') ||
    trimmed.includes('youtu.be') ||
    trimmed.includes('youtube-nocookie.com') ||
    /^[a-zA-Z0-9_-]{11}$/.test(input.trim())
  );
};

/**
 * Format seconds to human readable timestamp
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted timestamp (0:00, 1:23, 1:23:45)
 */
export const formatTimestamp = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format seconds to SRT timestamp format
 * @param {number} seconds - Time in seconds
 * @returns {string} - SRT format (00:00:00,000)
 */
export const formatSrtTimestamp = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Format seconds to VTT timestamp format
 * @param {number} seconds - Time in seconds
 * @returns {string} - VTT format (00:00:00.000)
 */
export const formatVttTimestamp = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export default {
  parseYouTubeUrl,
  normalizeYouTubeUrl,
  parseTimestamp,
  buildTimestampUrl,
  getThumbnailUrls,
  looksLikeYouTubeUrl,
  formatTimestamp,
  formatSrtTimestamp,
  formatVttTimestamp,
};
