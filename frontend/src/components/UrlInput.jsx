import { useState } from 'react';
import { Search, Loader2, Youtube } from 'lucide-react';
import { Button } from './ui/button';

export const UrlInput = ({ onSubmit, isLoading }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  const isValidUrl = (input) => {
    if (!input) return true; // Empty is valid (just not submittable)
    const patterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /youtube\.com\/embed\//,
      /youtube\.com\/shorts\//,
      /^[a-zA-Z0-9_-]{11}$/
    ];
    return patterns.some((p) => p.test(input));
  };

  const showError = url && !isValidUrl(url);

  return (
    <form onSubmit={handleSubmit} className="w-full animate-slide-up stagger-2">
      <div
        className={`
          input-glow relative flex items-center
          glass-surface rounded-full
          h-14 sm:h-16 px-2
          ${showError ? 'ring-2 ring-destructive/50' : ''}
        `}
      >
        <div className="flex items-center justify-center w-12 h-full">
          <Youtube className="h-5 w-5 text-muted-foreground" />
        </div>
        
        <input
          data-testid="url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste YouTube URL or video ID..."
          disabled={isLoading}
          className="
            flex-1 h-full bg-transparent
            text-sm sm:text-base text-foreground placeholder:text-muted-foreground
            focus:outline-none
            disabled:opacity-50
          "
          aria-label="YouTube video URL"
          aria-invalid={showError}
        />
        
        <Button
          data-testid="fetch-button"
          type="submit"
          disabled={!url.trim() || isLoading || showError}
          className="
            h-10 sm:h-12 px-5 sm:px-6
            rounded-full font-medium text-sm
            bg-primary text-primary-foreground
            hover:bg-primary/90
            disabled:opacity-50 disabled:cursor-not-allowed
            btn-lift
          "
          aria-label="Get transcript"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Get Transcript</span>
              <span className="sm:hidden">Go</span>
            </>
          )}
        </Button>
      </div>
      
      {showError && (
        <p className="mt-2 text-xs text-destructive text-center">
          Please enter a valid YouTube URL or video ID
        </p>
      )}
    </form>
  );
};

export default UrlInput;
