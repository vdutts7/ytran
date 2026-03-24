import { useState, useEffect } from 'react';
import { Skeleton } from './ui/skeleton';
import { User } from 'lucide-react';

// Get thumbnail URLs with fallback chain
const getThumbnailUrls = (videoId) => [
  `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
  `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
];

export const VideoCard = ({ videoId, onMetadataLoaded }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load thumbnail
  useEffect(() => {
    if (!videoId) return;
    
    setIsLoading(true);
    const urls = getThumbnailUrls(videoId);
    let index = 0;
    let mounted = true;
    
    const loadNext = () => {
      if (index >= urls.length || !mounted) {
        setIsLoading(false);
        return;
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (mounted && img.naturalWidth > 120) {
          setThumbnailUrl(urls[index]);
          setIsLoading(false);
        } else {
          index++;
          loadNext();
        }
      };
      img.onerror = () => {
        index++;
        loadNext();
      };
      img.src = urls[index];
    };
    
    loadNext();
    return () => { mounted = false; };
  }, [videoId]);

  // Load metadata via oEmbed
  useEffect(() => {
    if (!videoId) return;
    
    let mounted = true;
    
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(res => res.json())
      .then(data => {
        if (mounted && data) {
          const meta = {
            title: data.title,
            author: data.author_name,
          };
          setMetadata(meta);
          if (onMetadataLoaded) onMetadataLoaded(meta);
        }
      })
      .catch(() => {});
    
    return () => { mounted = false; };
  }, [videoId, onMetadataLoaded]);

  if (!videoId) return null;

  return (
    <div 
      data-testid="video-card"
      className="glass rounded-2xl overflow-hidden animate-scale-in"
    >
      <div className="relative aspect-video-thumb bg-secondary/50">
        {isLoading ? (
          <Skeleton className="absolute inset-0 shimmer" />
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={metadata?.title || 'Video thumbnail'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Preview unavailable
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Video info */}
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
              <Skeleton className="h-4 w-3/4 bg-white/10" />
              <Skeleton className="h-3 w-1/3 bg-white/10" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
