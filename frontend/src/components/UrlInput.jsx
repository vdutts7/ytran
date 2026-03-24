import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import { parseYouTubeUrl, looksLikeYouTubeUrl } from '../lib/youtube';

export const UrlInput = ({ onSubmit, isLoading, value, onChange }) => {
  const inputRef = useRef(null);
  const [localValue, setLocalValue] = useState(value || '');
  const [validationError, setValidationError] = useState(null);

  // Sync with parent value
  useEffect(() => {
    if (value !== undefined) {
      setLocalValue(value);
    }
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    setValidationError(null);
    onChange?.(newValue);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    
    if (!localValue.trim()) return;
    
    const { videoId, error } = parseYouTubeUrl(localValue);
    
    if (!videoId) {
      setValidationError(error || 'Invalid YouTube URL');
      return;
    }
    
    onSubmit(localValue.trim());
  };

  const handleClear = () => {
    setLocalValue('');
    setValidationError(null);
    onChange?.('');
    inputRef.current?.focus();
  };

  const handlePaste = useCallback((e) => {
    // Get pasted text
    const pastedText = e.clipboardData?.getData('text') || '';
    
    // Auto-submit if it looks like a YouTube URL
    if (looksLikeYouTubeUrl(pastedText)) {
      setTimeout(() => {
        const { videoId } = parseYouTubeUrl(pastedText);
        if (videoId) {
          onSubmit(pastedText.trim());
        }
      }, 50);
    }
  }, [onSubmit]);

  // Global paste handler
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      // Only if not focused on another input
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      const pastedText = e.clipboardData?.getData('text') || '';
      if (looksLikeYouTubeUrl(pastedText)) {
        setLocalValue(pastedText);
        onChange?.(pastedText);
        
        const { videoId } = parseYouTubeUrl(pastedText);
        if (videoId) {
          onSubmit(pastedText.trim());
        }
      }
    };
    
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [onSubmit, onChange]);

  const showError = validationError && localValue;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`
          relative flex items-center
          glass-strong rounded-2xl
          h-14 sm:h-16 px-4
          transition-all duration-300
          ${showError ? 'ring-2 ring-red-500/50' : 'focus-within:glow-ring'}
        `}
      >
        <div className="flex items-center justify-center w-8 h-full">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        
        <input
          ref={inputRef}
          data-testid="url-input"
          type="text"
          value={localValue}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder="Paste YouTube URL anywhere..."
          disabled={isLoading}
          className="
            flex-1 h-full bg-transparent
            text-sm sm:text-base text-foreground placeholder:text-muted-foreground
            focus:outline-none
            disabled:opacity-50
            font-mono
          "
          aria-label="YouTube video URL"
          aria-invalid={!!showError}
        />
        
        {localValue && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear input"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        
        <Button
          data-testid="fetch-button"
          type="submit"
          disabled={!localValue.trim() || isLoading}
          className="
            h-9 sm:h-10 px-4 sm:px-5 ml-2
            rounded-xl font-medium text-sm
            bg-primary text-primary-foreground
            hover:bg-primary/90
            disabled:opacity-50 disabled:cursor-not-allowed
            btn-glow
          "
          aria-label="Get transcript"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Search className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Go</span>
            </>
          )}
        </Button>
      </div>
      
      {showError && (
        <p className="mt-2 text-xs text-red-400 text-center animate-fade-in">
          {validationError}
        </p>
      )}
    </form>
  );
};

export default UrlInput;
