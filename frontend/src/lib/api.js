import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const apiClient = axios.create({
  baseURL: API,
  timeout: 120000, // 2 minutes for transcript fetching
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchTranscript = async (url, language = null) => {
  const response = await apiClient.post('/transcript', {
    url,
    language,
  });
  return response.data;
};

export const fetchAvailableLanguages = async (videoId) => {
  const response = await apiClient.get(`/languages/${videoId}`);
  return response.data;
};

export const formatTimestamp = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const generateTxtContent = (transcript, showTimestamps = true) => {
  return transcript
    .map((line) => {
      if (showTimestamps) {
        return `[${formatTimestamp(line.start)}] ${line.text}`;
      }
      return line.text;
    })
    .join('\n');
};

export const generateSrtContent = (transcript) => {
  return transcript
    .map((line, index) => {
      const startTime = formatSrtTimestamp(line.start);
      const endTime = formatSrtTimestamp(line.start + line.duration);
      return `${index + 1}\n${startTime} --> ${endTime}\n${line.text}\n`;
    })
    .join('\n');
};

const formatSrtTimestamp = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

export const downloadFile = (content, filename, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const extractVideoId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
};

export default apiClient;
