# Skeleton Loading Usage Guide

## Quick Implementation

### 1. Import Skeleton Components
```tsx
import { 
  SkeletonCard, 
  SkeletonTable, 
  SkeletonStats,
  SkeletonForm 
} from '../components/skeleton/SkeletonCard';
```

### 2. Use in Components

#### Dashboard Stats
```tsx
{isLoading ? (
  <SkeletonStats />
) : (
  <div className="grid grid-cols-4">
    {/* Your stats */}
  </div>
)}
```

#### Proposal List (Table)
```tsx
{isLoading ? (
  <SkeletonTable rows={5} />
) : (
  <table>
    {/* Your table */}
  </table>
)}
```

#### Cards Grid
```tsx
{isLoading ? (
  <div className="grid grid-cols-3 gap-4">
    <SkeletonCard />
    <SkeletonCard />
    <SkeletonCard />
  </div>
) : (
  <div className="grid grid-cols-3 gap-4">
    {proposals.map(p => <ProposalCard key={p.id} {...p} />)}
  </div>
)}
```

#### Forms
```tsx
{isLoading ? (
  <SkeletonForm fields={4} />
) : (
  <form>
    {/* Your form */}
  </form>
)}
```

### 3. Custom Skeleton Patterns

For custom layouts, create component-specific skeletons:

```tsx
// ProposalBuilderSkeleton.tsx
export const ProposalBuilderSkeleton = () => (
  <div className="animate-pulse space-y-6">
    {/* Steps */}
    <div className="flex justify-center space-x-4">
      <div className="w-10 h-10 rounded-full bg-slate-200" />
      <div className="w-16 h-0.5 bg-slate-200 self-center" />
      <div className="w-10 h-10 rounded-full bg-slate-200" />
    </div>
    
    {/* Content */}
    <div className="card p-6 space-y-4">
      <div className="h-6 w-48 bg-slate-200 rounded" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-24 bg-slate-200 rounded" />
        <div className="h-24 bg-slate-200 rounded" />
      </div>
    </div>
  </div>
);
```

## Best Practices

1. **Match layout exactly** - Skeleton should mirror final content dimensions
2. **Use animate-pulse** - Consistent pulsing animation
3. **Respect dark mode** - Skeletons adapt to theme
4. **Limit simultaneous** - Max 3-5 skeletons visible
5. **Fast transitions** - < 300ms fade to real content

## Example: Full Page Implementation

```tsx
import { SkeletonStats, SkeletonTable } from '../components/skeleton/SkeletonCard';

const Dashboard = () => {
  const { data, isLoading } = useDashboardData();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      
      {isLoading ? (
        <SkeletonStats />
      ) : (
        <StatsGrid data={data.stats} />
      )}
      
      <h2 className="text-xl font-semibold">Recent Proposals</h2>
      
      {isLoading ? (
        <SkeletonTable rows={5} />
      ) : (
        <ProposalsTable proposals={data.proposals} />
      )}
    </div>
  );
};
```
