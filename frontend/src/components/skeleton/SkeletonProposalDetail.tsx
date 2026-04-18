const SkeletonProposalDetail = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back button skeleton */}
      <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />

      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
          </div>
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="h-10 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-10 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-10 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content skeleton */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client info skeleton */}
          <div className="glass-tile p-6 space-y-4">
            <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="flex items-center">
              <div className="h-12 w-12 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="ml-4 space-y-2">
                <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-56 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          </div>

          {/* Services skeleton */}
          <div className="glass-tile p-6 space-y-4">
            <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 bg-white/40 dark:bg-slate-800/60 rounded-lg space-y-2 border border-white/10 dark:border-slate-600/40"
              >
                <div className="flex justify-between">
                  <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>

          {/* Terms skeleton */}
          <div className="glass-tile p-6 space-y-4">
            <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        </div>

        {/* Sidebar skeleton */}
        <div className="space-y-6">
          {/* Pricing skeleton */}
          <div className="glass-tile p-6 space-y-4">
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="border-t border-white/20 dark:border-slate-600/40 pt-3">
                <div className="flex justify-between">
                  <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Valid until skeleton */}
          <div className="glass-tile p-6 space-y-2">
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>

          {/* Created by skeleton */}
          <div className="glass-tile p-6 space-y-2">
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonProposalDetail;
