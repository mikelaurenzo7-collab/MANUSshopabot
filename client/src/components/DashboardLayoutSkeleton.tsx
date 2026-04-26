import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top nav skeleton */}
      <div className="h-14 border-b border-border bg-background flex items-center gap-3 px-5">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-24" />
        <div className="hidden md:flex items-center gap-1 ml-3">
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="hidden md:flex items-center gap-1 ml-2 flex-1">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-4 space-y-4">
        <Skeleton className="h-12 w-48 rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
