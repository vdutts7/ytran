import { useState, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { FileText } from 'lucide-react';
import { UrlInput } from '../components/UrlInput';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { Footer } from '../components/Footer';
import { fetchTranscript } from '../lib/api';

const HomePage = () => {
  const [transcriptData, setTranscriptData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLanguage, setIsLoadingLanguage] = useState(false);
  const [error, setError] = useState(null);
  const [lastUrl, setLastUrl] = useState('');

  const handleFetchTranscript = useCallback(async (url, language = null) => {
    setLastUrl(url);
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTranscript(url, language);
      setTranscriptData(data);
      toast.success('Transcript loaded successfully');
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.message ||
        'Failed to fetch transcript';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLanguageChange = useCallback(
    async (languageCode) => {
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
    },
    [lastUrl, transcriptData]
  );

  const handleRetry = useCallback(() => {
    if (lastUrl) {
      handleFetchTranscript(lastUrl);
    }
  }, [lastUrl, handleFetchTranscript]);

  return (
    <div className="min-h-screen bg-background bg-gradient-radial">
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'glass-surface',
          duration: 3000,
        }}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center space-y-6 mb-12 sm:mb-16">
          <div className="animate-slide-up stagger-1">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/5 mb-4">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1
              data-testid="app-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground tracking-tight"
            >
              ytranscript
            </h1>
            <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-lg mx-auto">
              Extract transcripts from any YouTube video instantly.
              <br className="hidden sm:block" />
              Powered by yt-dlp & youtube-transcript-api.
            </p>
          </div>

          {/* URL Input */}
          <div className="w-full max-w-2xl">
            <UrlInput onSubmit={handleFetchTranscript} isLoading={isLoading} />
          </div>
        </div>

        {/* Results Section */}
        <div className="mt-8">
          {isLoading && !transcriptData && <LoadingSkeleton />}

          {error && !isLoading && (
            <ErrorDisplay message={error} onRetry={handleRetry} />
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
            />
          )}

          {/* Empty State */}
          {!isLoading && !error && !transcriptData && (
            <div
              data-testid="empty-state"
              className="text-center py-16 animate-fade-in"
            >
              <p className="text-muted-foreground">
                Paste a YouTube URL above to get started
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
