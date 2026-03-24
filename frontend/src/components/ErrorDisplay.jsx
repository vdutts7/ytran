import { AlertCircle, RefreshCw, ShieldOff, Lock, VideoOff } from 'lucide-react';
import { Button } from './ui/button';

const getErrorInfo = (message) => {
  const lowerMessage = message?.toLowerCase() || '';
  
  if (lowerMessage.includes('disabled')) {
    return {
      icon: ShieldOff,
      title: 'Transcripts Disabled',
      description: 'The video owner has disabled transcripts for this video.',
    };
  }
  
  if (lowerMessage.includes('not found') || lowerMessage.includes('no transcript')) {
    return {
      icon: VideoOff,
      title: 'No Captions Found',
      description: 'This video doesn\'t have captions available in any language.',
    };
  }
  
  if (lowerMessage.includes('private') || lowerMessage.includes('unavailable')) {
    return {
      icon: Lock,
      title: 'Video Unavailable',
      description: 'This video is private, age-restricted, or unavailable.',
    };
  }
  
  if (lowerMessage.includes('invalid')) {
    return {
      icon: AlertCircle,
      title: 'Invalid URL',
      description: 'Please check the URL and try again.',
    };
  }
  
  return {
    icon: AlertCircle,
    title: 'Something Went Wrong',
    description: message || 'Failed to fetch transcript. Please try again.',
  };
};

export const ErrorDisplay = ({ message, onRetry, statusCode }) => {
  const { icon: Icon, title, description } = getErrorInfo(message);
  
  return (
    <div
      data-testid="error-display"
      className="glass rounded-2xl p-8 sm:p-10 text-center animate-bounce-in"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <Icon className="h-7 w-7 text-red-400" />
        </div>
        
        <div className="space-y-2">
          <h3 className="font-sans font-semibold text-foreground">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {description}
          </p>
          {statusCode && (
            <p className="text-xs text-muted-foreground/50 font-mono">
              Error {statusCode}
            </p>
          )}
        </div>
        
        {onRetry && (
          <Button
            data-testid="retry-button"
            variant="outline"
            onClick={onRetry}
            className="mt-2 rounded-xl border-white/10 hover:bg-white/5 btn-glow"
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
