import { Sidebar } from '@/components/Sidebar';
import { BarFilterProvider } from '@/components/BarFilterContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BarFilterProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </BarFilterProvider>
  );
}
