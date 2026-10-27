import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const LandingView = lazy(() =>
  import('@/views/LandingView').then((module) => ({ default: module.LandingView })),
);
const GenerateView = lazy(() =>
  import('@/views/GenerateView').then((module) => ({ default: module.GenerateView })),
);
const TemplatesView = lazy(() =>
  import('@/views/TemplatesView').then((module) => ({ default: module.TemplatesView })),
);
const HistoryView = lazy(() =>
  import('@/views/HistoryView').then((module) => ({ default: module.HistoryView })),
);
const AdminUsersView = lazy(() =>
  import('@/views/AdminUsersView').then((module) => ({ default: module.AdminUsersView })),
);

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route path="/generate" element={<GenerateView />} />
        <Route path="/templates" element={<TemplatesView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/admin/users" element={<AdminUsersView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div
      className="flex min-h-[60vh] flex-col gap-6 px-8 py-6 opacity-50"
      role="status"
      aria-label="页面加载中"
    >
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="animate-pulse h-7 w-7 rounded-full bg-primary/10" />
        <div className="animate-pulse h-4 w-28 rounded-md bg-primary/10" />
        <div className="ml-auto flex gap-2">
          <div className="animate-pulse h-8 w-20 rounded-full bg-primary/10" />
        </div>
      </div>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        aria-hidden="true"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl bg-primary/10"
            style={{ aspectRatio: '4 / 3' }}
          />
        ))}
      </div>
    </div>
  );
}
