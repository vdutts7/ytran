import { useState, useEffect, useCallback } from 'react';
import { getThumbnailUrls } from '../lib/youtube';
import { fetchVideoMetadata } from '../lib/api';
import { Skeleton } from './ui/skeleton';
import { Clock, User } from 'lucide-react';

export const VideoCard = ({ videoId, onMetadataLoaded }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [thumbnailLoading, setThumbnailLoading] = useState(true);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Load thumbnail with fallback chain
  useEffect(() => {
    if (!videoId) return;
    
    setThumbnailLoading(true);
    setThumbnailError(false);
    
    const urls = getThumbnailUrls(videoId);
    let currentIndex = 0;
    
    const tryNextThumbnail = () => {
      if (currentIndex >= urls.length) {
        setThumbnailError(true);
        setThumbnailLoading(false);
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        // Check if it's a valid thumbnail (not the default placeholder)
        if (img.width > 120) {
          setThumbnailUrl(urls[currentIndex]);
          setThumbnailLoading(false);
        } else {
          currentIndex++;
          tryNextThumbnail();
        }
      };
      img.onerror = () => {
        currentIndex++;
        tryNextThumbnail();
      };
      img.src = urls[currentIndex];
    };
    
    tryNextThumbnail();
  }, [videoId]);

  // Load metadata from oEmbed
  useEffect(() => {
    if (!videoId) return;
    
    fetchVideoMetadata(videoId).then((data) => {
      if (data) {
        setMetadata(data);
        onMetadataLoaded?.(data);
      }
    });
  }, [videoId, onMetadataLoaded]);

  if (!videoId) return null;

  return (
    <div 
      data-testid="video-card"
      className="glass rounded-2xl overflow-hidden animate-scale-in"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video-thumb bg-secondary/50">
        {thumbnailLoading ? (
          <Skeleton className="absolute inset-0 shimmer" />
        ) : thumbnailError ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <span className="text-sm">Thumbnail unavailable</span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={metadata?.title || 'Video thumbnail'}
            className="w-full h-full object-cover"
          />
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Video info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {metadata ? (
            <>
              <h3 className="font-sans text-sm sm:text-base font-medium text-white line-clamp-2 mb-1">
                {metadata.title}
              </h3>
              <div className="flex items-center gap-2 text-white/70 text-xs">
                <User className="h-3 w-3" />
                <span className="truncate">{metadata.author}</span>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4 shimmer" />
              <Skeleton className="h-3 w-1/3 shimmer" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
