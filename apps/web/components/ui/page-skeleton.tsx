"use client";

type Variant = "detail" | "list" | "settings";

/** Layout-matched loading shell — avoids flash of false 404 while data hydrates. */
export function PageSkeleton({ variant = "detail" }: { variant?: Variant }) {
  if (variant === "list") return <ListSkeleton />;
  if (variant === "settings") return <SettingsSkeleton />;
  return <DetailSkeleton />;
}

export function PageSuspenseFallback() {
  return (
    <div className="min-h-[60vh] bg-bg wv-fade-in">
      <PageSkeleton variant="detail" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="max-w-[1360px] mx-auto px-6 pb-16 wv-fade-in">
      <div className="pt-4 flex items-center gap-2">
        <div className="wv-skeleton h-3 w-24" />
        <div className="wv-skeleton h-3 w-3 rounded-full" />
        <div className="wv-skeleton h-3 w-40" />
      </div>
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <div className="wv-skeleton h-7 w-7 rounded-md shrink-0" />
        <div className="wv-skeleton h-6 w-56 max-w-[70%]" />
        <div className="wv-skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="mt-2 wv-skeleton h-3 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start mt-6">
        <div className="flex flex-col gap-4">
          <SkeletonPanel lines={2} bodyH={72} />
          <SkeletonPanel lines={1} bodyH={160} />
          <SkeletonPanel lines={1} bodyH={120} />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonPanel lines={1} bodyH={100} />
          <SkeletonPanel lines={1} bodyH={88} />
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="max-w-[860px] mx-auto px-6 pb-16 wv-fade-in">
      <div className="pt-6 wv-skeleton h-7 w-48" />
      <div className="mt-2 wv-skeleton h-3 w-64" />
      <div className="mt-6 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border border-line rounded-lg bg-surface p-[11px_14px] flex items-center gap-3">
            <div className="wv-skeleton h-4 w-4 rounded shrink-0" />
            <div className="wv-skeleton h-4 flex-1 max-w-[320px]" />
            <div className="wv-skeleton h-5 w-16 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="max-w-[920px] mx-auto px-6 pb-16 wv-fade-in">
      <div className="pt-6 wv-skeleton h-7 w-32" />
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border border-line rounded-xl bg-surface p-4 flex items-center gap-3">
            <div className="wv-skeleton h-9 w-9 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="wv-skeleton h-4 w-28" />
              <div className="wv-skeleton h-3 w-44 mt-2" />
            </div>
            <div className="wv-skeleton h-8 w-24 rounded-md shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonPanel({ lines, bodyH }: { lines: number; bodyH: number }) {
  return (
    <div className="border border-line rounded-2xl bg-surface overflow-hidden">
      <div className="py-3.5 px-4 border-b border-line-soft flex flex-col gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="wv-skeleton h-3.5" style={{ width: i === 0 ? "38%" : "52%" }} />
        ))}
      </div>
      <div className="p-4">
        <div className="wv-skeleton rounded-md" style={{ height: bodyH }} />
      </div>
    </div>
  );
}
