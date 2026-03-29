'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

type Step = 'email' | 'sent';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient.signIn as any).magicLink({
      email,
      callbackURL: '/bars',
    });

    if (result?.error) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    setStep('sent');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Backstage</h1>
          <p className="text-sm text-gray-500 mb-6">Admin access only</p>

          {step === 'email' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="you@glitchbars.com"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-default"
              >
                {loading ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          ) : (
            <div className="text-center space-y-3">
              <div className="text-4xl">✉️</div>
              <p className="text-sm font-medium text-gray-900">Check your inbox</p>
              <p className="text-sm text-gray-500">
                We sent a sign-in link to <span className="font-medium">{email}</span>
              </p>
              <button
                onClick={() => setStep('email')}
                className="text-sm text-gray-400 hover:text-gray-600 underline cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
