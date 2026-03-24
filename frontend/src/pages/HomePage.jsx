import { useState, useCallback, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { FileText, Upload } from 'lucide-react';
import { UrlInput } from '../components/UrlInput';
import { VideoCard } from '../components/VideoCard';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { Footer } from '../components/Footer';
import { fetchTranscript } from '../lib/api';
import { parseYouTubeUrl, looksLikeYouTubeUrl } from '../lib/youtube';

const HomePage = () => {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [videoMetadata, setVideoMetadata] = useState(null);
  const [transcriptData, setTranscriptData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLanguage, setIsLoadingLanguage] = useState(false);
  const [error, setError] = useState(null);
  const [lastUrl, setLastUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Handle URL change - show video card immediately
  const handleUrlChange = useCallback((newUrl) => {
    setUrl(newUrl);
    
    const { videoId: newVideoId } = parseYouTubeUrl(newUrl);
    if (newVideoId && newVideoId !== videoId) {
      setVideoId(newVideoId);
      setError(null);
    } else if (!newVideoId) {
      setVideoId(null);
    }
  }, [videoId]);

  // Fetch transcript
  const handleFetchTranscript = useCallback(async (inputUrl, language = null) => {
    const { videoId: parsedVideoId } = parseYouTubeUrl(inputUrl);
    
    if (!parsedVideoId) {
      setError({ message: 'Invalid YouTube URL' });
      return;
    }
    
    setLastUrl(inputUrl);
    setVideoId(parsedVideoId);
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTranscript(inputUrl, language);
      setTranscriptData(data);
      toast.success('Transcript loaded');
    } catch (err) {
      const message = err.response?.data?.detail || err.message || 'Failed to fetch transcript';
      const statusCode = err.response?.status;
      setError({ message, statusCode });
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle language change
  const handleLanguageChange = useCallback(async (languageCode) => {
    if (!lastUrl || !transcriptData) return;

    setIsLoadingLanguage(true);
    try {
      const data = await fetchTranscript(lastUrl, languageCode);
      setTranscriptData(data);
      toast.success(`Switched to ${languageCode}`);
    } catch (err) {
      toast.error('Failed to switch language');
    } finally {
      setIsLoadingLanguage(false);
    }
  }, [lastUrl, transcriptData]);

  // Handle retry
  const handleRetry = useCallback(() => {
    if (lastUrl) {
      handleFetchTranscript(lastUrl);
    }
  }, [lastUrl, handleFetchTranscript]);

  // Handle metadata from video card
  const handleMetadataLoaded = useCallback((metadata) => {
    setVideoMetadata(metadata);
  }, []);

  // Drag and drop handlers
  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };
    
    const handleDragLeave = (e) => {
      e.preventDefault();
      if (e.target === document.body || !e.relatedTarget) {
        setIsDragging(false);
      }
    };
    
    const handleDrop = (e) => {
      e.preventDefault();
      setIsDragging(false);
      
      const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
      if (text && looksLikeYouTubeUrl(text)) {
        setUrl(text);
        handleFetchTranscript(text);
      }
    };
    
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleFetchTranscript]);

  // Check for shared URL (PWA Web Share Target)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
    
    if (sharedUrl && looksLikeYouTubeUrl(sharedUrl)) {
      setUrl(sharedUrl);
      handleFetchTranscript(sharedUrl);
      
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [handleFetchTranscript]);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col relative">
      {/* Atmospheric background */}
      <div className="bg-atmosphere">
        <div className="bg-gradient-pink" />
      </div>
      <div className="noise-overlay" />
      
      {/* Drop overlay */}
      {isDragging && (
        <div className="drop-overlay animate-fade-in">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-3xl glass flex items-center justify-center">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <p className="text-lg text-foreground font-medium">Drop YouTube URL</p>
          </div>
        </div>
      )}
      
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'glass-strong border-white/10',
          duration: 3000,
        }}
      />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 sm:py-12 relative z-10">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center space-y-6 mb-8">
          <div className="animate-slide-up">
            <h1
              data-testid="app-title"
              className="text-4xl sm:text-5xl lg:text-6xl font-normal text-foreground italic"
            >
              ytranscript
            </h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground font-mono">
              Extract transcripts from YouTube videos
            </p>
          </div>

          {/* URL Input */}
          <div className="w-full animate-slide-up stagger-2">
            <UrlInput 
              value={url}
              onChange={handleUrlChange}
              onSubmit={handleFetchTranscript} 
              isLoading={isLoading} 
            />
          </div>
        </div>

        {/* Video card - show when we have a video ID */}
        {videoId && !transcriptData && !isLoading && !error && (
          <div className="mb-6 animate-scale-in">
            <VideoCard 
              videoId={videoId} 
              onMetadataLoaded={handleMetadataLoaded}
            />
          </div>
        )}

        {/* Results Section */}
        <div className="mt-4">
          {isLoading && (
            <LoadingSkeleton showVideoCard={!!videoId} />
          )}

          {error && !isLoading && (
            <ErrorDisplay 
              message={error.message} 
              statusCode={error.statusCode}
              onRetry={handleRetry} 
            />
          )}

          {transcriptData && !isLoading && !error && (
            <TranscriptViewer
              transcript={transcriptData.transcript}
              title={transcriptData.title}
              videoId={transcriptData.video_id}
              availableLanguages={transcriptData.available_languages}
              selectedLanguage={transcriptData.selected_language}
              onLanguageChange={handleLanguageChange}
              isLoadingLanguage={isLoadingLanguage}
              backend={transcriptData.backend}
              author={videoMetadata?.author}
            />
          )}

          {/* Empty State */}
          {!isLoading && !error && !transcriptData && !videoId && (
            <div
              data-testid="empty-state"
              className="text-center py-16 animate-fade-in"
            >
              <p className="text-muted-foreground text-sm font-mono">
                Paste a YouTube URL to get started
              </p>
              <p className="text-muted-foreground/50 text-xs font-mono mt-2">
                or drop a link anywhere on this page
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;
