import { Skeleton } from "../../components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div className="flex min-h-screen bg-surface-canvas">
      {/* Sidebar placeholder */}
      <div className="hidden w-60 shrink-0 border-r border-border-subtle bg-surface-raised md:block" />
      <div className="flex flex-1 flex-col">
        <div className="sticky top-0 h-[57px] border-b border-border-subtle bg-surface-raised/95 backdrop-blur" />
        <div className="flex-1 p-4 sm:p-6">
          <div className="mb-6">
            <Skeleton className="mb-1 h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-4">
            <Skeleton variant="rect" className="h-32 w-full rounded-xl" />
            <Skeleton variant="rect" className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
