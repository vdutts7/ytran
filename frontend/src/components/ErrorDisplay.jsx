import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export const ErrorDisplay = ({ message, onRetry }) => {
  return (
    <div
      data-testid="error-display"
      className="glass-surface rounded-3xl p-8 sm:p-12 text-center animate-slide-up stagger-3"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h3 className="font-semibold text-foreground">
            Unable to fetch transcript
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {message || 'This video may not have captions available, or the URL might be invalid.'}
          </p>
        </div>
        
        {onRetry && (
          <Button
            data-testid="retry-button"
            variant="outline"
            onClick={onRetry}
            className="mt-2 rounded-full btn-lift"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
};

export default ErrorDisplay;
