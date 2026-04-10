interface SkeletonCardProps {
  count?: number;
  className?: string;
}

export const SkeletonCard = ({ count = 3, className = '' }: SkeletonCardProps) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-tile p-5 animate-pulse">
          <div className="flex items-start justify-between mb-4">
            <div className="h-6 w-24 bg-slate-200 rounded" />
            <div className="h-4 w-4 bg-slate-200 rounded" />
          </div>
          <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-full bg-slate-200 rounded mb-1" />
          <div className="h-4 w-2/3 bg-slate-200 rounded mb-4" />
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <div className="h-4 w-20 bg-slate-200 rounded" />
            <div className="h-4 w-16 bg-slate-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => {
  return (
    <div className="glass-tile overflow-hidden animate-pulse">
      <div className="p-4 border-b border-white/10">
        <div className="h-6 w-32 bg-slate-200 rounded" />
      </div>
      <div className="divide-y divide-white/10">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className="h-10 w-10 bg-slate-200 rounded-lg" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-3 w-32 bg-slate-200 rounded" />
              </div>
            </div>
            <div className="h-4 w-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonStats = ({ count = 4 }: { count?: number }) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(count, 4)} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-tile p-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-8 w-20 bg-slate-200 rounded" />
            </div>
            <div className="h-12 w-12 bg-slate-200 rounded-lg" />
          </div>
          <div className="mt-4 h-3 w-32 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
};

export const SkeletonForm = ({ fields = 4 }: { fields?: number }) => {
  return (
    <div className="glass-tile p-6 space-y-6 animate-pulse">
      <div className="h-6 w-32 bg-slate-200 rounded" />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
};

export default SkeletonCard;
