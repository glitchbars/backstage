import { Sidebar } from '@/components/Sidebar';
import { BarFilterProvider } from '@/components/BarFilterContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BarFilterProvider>
      {/* Pinned to the viewport so <main> is the only thing that scrolls —
          otherwise a tall page drags the sidebar off the top with it. */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto p-8">{children}</main>
      </div>
    </BarFilterProvider>
  );
}
