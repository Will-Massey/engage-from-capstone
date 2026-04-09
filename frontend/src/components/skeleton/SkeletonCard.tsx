interface SkeletonCardProps {
  className?: string;
}

export const SkeletonCard = ({ className = '' }: SkeletonCardProps) => (
  <div className={`card p-6 animate-pulse ${className}`}>
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
    </div>
    <div className="mt-4 flex justify-between">
      <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-lg" />
      <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
    </div>
  </div>
);

export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
  <div className="card overflow-hidden">
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-slate-200 dark:border-slate-700 space-x-4">
        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="flex-1" />
        <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="flex items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 space-x-4"
        >
          <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="flex-1" />
          <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonStats = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="glass-tile p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700" />
          <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="mt-4 h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="mt-2 h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    ))}
  </div>
);

export const SkeletonProposalBuilder = () => (
  <div className="space-y-6 animate-pulse">
    {/* Step indicator */}
    <div className="flex items-center justify-center space-x-4">
      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="w-16 h-0.5 bg-slate-200 dark:bg-slate-700" />
      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="w-16 h-0.5 bg-slate-200 dark:bg-slate-700" />
      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
    </div>

    {/* Main content */}
    <div className="card p-6">
      <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/6" />
      </div>
      
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
      </div>
    </div>
  </div>
);

export const SkeletonForm = ({ fields = 4 }: { fields?: number }) => (
  <div className="card p-6 animate-pulse space-y-4">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i}>
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
      </div>
    ))}
    <div className="pt-4 flex justify-end space-x-3">
      <div className="h-10 w-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
      <div className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded-xl" />
    </div>
  </div>
);
