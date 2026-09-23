import { Skeleton } from "../../components/ui/Skeleton";

export default function KitchenLoading() {
  return (
    <div data-theme="dark" className="min-h-screen bg-surface-canvas">
      <div className="sticky top-0 z-40 h-[57px] border-b border-border-subtle bg-surface-raised/95 backdrop-blur" />
      <div className="p-4 sm:p-6">
        <Skeleton className="mb-6 h-8 w-24" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border-subtle bg-surface-raised p-4">
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-16 rounded-pill" />
              </div>
              <div className="space-y-2">
                <Skeleton variant="rect" className="h-20 w-full rounded-md" />
                <Skeleton variant="rect" className="h-20 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
