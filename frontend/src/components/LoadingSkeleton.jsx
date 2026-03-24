import { Skeleton } from './ui/skeleton';

export const LoadingSkeleton = ({ showVideoCard = false }) => {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Video card skeleton */}
      {showVideoCard && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="aspect-video-thumb shimmer" />
        </div>
      )}
      
      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden bg-white/5">
        <div className="h-full w-1/2 progress-bar rounded-full" />
      </div>
      
      {/* Transcript skeleton */}
      <div
        data-testid="loading-skeleton"
        className="glass rounded-2xl overflow-hidden h-[400px]"
      >
        {/* Header skeleton */}
        <div className="flex flex-col gap-3 p-4 border-b border-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 shimmer" />
              <Skeleton className="h-3 w-24 shimmer" />
            </div>
            <Skeleton className="h-8 w-32 rounded-lg shimmer" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-40 rounded-lg shimmer" />
            <Skeleton className="h-5 w-12 rounded-full shimmer" />
            <Skeleton className="h-5 w-12 rounded-full shimmer" />
          </div>
        </div>

        {/* Actions skeleton */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
          <Skeleton className="h-7 w-16 rounded-lg shimmer" />
          <Skeleton className="h-7 w-20 rounded-lg shimmer" />
        </div>

        {/* Content skeleton */}
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2">
              <Skeleton className="h-4 w-12 shimmer" />
              <div className="flex-1">
                <Skeleton 
                  className="h-4 shimmer" 
                  style={{ width: `${Math.random() * 40 + 50}%` }} 
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LoadingSkeleton;
