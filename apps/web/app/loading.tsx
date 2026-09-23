import { Skeleton } from "../components/ui/Skeleton";

// Root loading UI — shown by Next.js during initial navigation to any top-level
// route while its page chunk is loading. Keeps the layout stable so there's
// no blank flash between pages.
export default function RootLoading() {
  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="sticky top-0 z-40 h-[57px] border-b border-border-subtle bg-surface-raised/95 backdrop-blur" />
      <div className="p-4 sm:p-6">
        <Skeleton className="mb-6 h-8 w-32" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="aspect-square h-auto w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
