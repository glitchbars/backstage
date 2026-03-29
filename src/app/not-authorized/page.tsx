'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function NotAuthorizedPage() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm text-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">Access denied</h1>
          <p className="text-sm text-gray-500">
            Your account does not have <span className="font-medium">ADMIN</span> role. Contact a
            superadmin to grant you access.
          </p>
          <button
            onClick={handleSignOut}
            className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
