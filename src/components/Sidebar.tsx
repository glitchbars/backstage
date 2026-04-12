'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

const NAV_ITEMS = [
  { href: '/bars', label: 'Bars' },
  { href: '/mesas', label: 'Tables' },
  { href: '/consoles', label: 'Consoles' },
  { href: '/menu-categories', label: 'Menu Categories' },
  { href: '/menu-items', label: 'Menu Items' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight">Backstage</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-gray-700 space-y-2">
        {user && (
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-white truncate">{user.name || user.email}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="w-full px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md text-left transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
