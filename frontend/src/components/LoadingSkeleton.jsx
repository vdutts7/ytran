import { Skeleton } from './ui/skeleton';

export const LoadingSkeleton = () => {
  return (
    <div
      data-testid="loading-skeleton"
      className="glass-surface rounded-3xl overflow-hidden h-[600px] max-h-[80vh] animate-slide-up stagger-3"
    >
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 border-b border-black/5 dark:border-white/10">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48 skeleton-shimmer" />
          <Skeleton className="h-3 w-24 skeleton-shimmer" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32 rounded-xl skeleton-shimmer" />
          <Skeleton className="h-5 w-12 rounded-full skeleton-shimmer" />
        </div>
      </div>

      {/* Actions skeleton */}
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-black/5 dark:border-white/10">
        <Skeleton className="h-8 w-16 rounded-lg skeleton-shimmer" />
        <Skeleton className="h-8 w-14 rounded-lg skeleton-shimmer" />
        <Skeleton className="h-8 w-14 rounded-lg skeleton-shimmer" />
      </div>

      {/* Content skeleton */}
      <div className="p-4 sm:p-5 space-y-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-4 w-12 skeleton-shimmer" />
            <div className="flex-1 space-y-1">
              <Skeleton 
                className="h-4 skeleton-shimmer" 
                style={{ width: `${Math.random() * 40 + 60}%` }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingSkeleton;
