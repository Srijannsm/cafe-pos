import { Skeleton } from "../../../components/ui/Skeleton";

export default function OrderLoading() {
  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 h-[57px] border-b border-border-subtle bg-surface-raised/95 backdrop-blur" />
      <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
        {/* Menu panel */}
        <div>
          <Skeleton className="mb-4 h-7 w-16" />
          {/* Category pills */}
          <div className="mb-4 flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-pill" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-14 w-full rounded-md" />
            ))}
          </div>
        </div>
        {/* Order summary panel */}
        <div>
          <Skeleton variant="rect" className="h-72 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
