'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface BarWithAddress {
  id: string;
  name: string;
  address: {
    streetAddress: string;
    streetAddress2: string | null;
    postalCode: string;
    city: string;
    region: string | null;
    countryCode: string;
    phoneNumber: string | null;
  };
}

export default function EditBarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<{
    name: string;
    streetAddress: string;
    streetAddress2: string;
    postalCode: string;
    city: string;
    region: string;
    countryCode: string;
    phoneNumber: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/bars/${id}`)
      .then((r) => r.json())
      .then((bar: BarWithAddress) => {
        setForm({
          name: bar.name,
          streetAddress: bar.address.streetAddress,
          streetAddress2: bar.address.streetAddress2 ?? '',
          postalCode: bar.address.postalCode,
          city: bar.address.city,
          region: bar.address.region ?? '',
          countryCode: bar.address.countryCode,
          phoneNumber: bar.address.phoneNumber ?? '',
        });
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');

    const res = await fetch(`/api/bars/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError('Failed to save. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/bars');
  }

  if (!form) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  type FormKey = keyof NonNullable<typeof form>;

  function field(key: FormKey, label: string, required = false) {
    const value = (form as Record<FormKey, string>)[key];
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type="text"
          required={required}
          value={value}
          onChange={(e) => setForm({ ...form!, [key]: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/bars" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Bars
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Bar</h1>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('name', 'Bar name', true)}
          {field('streetAddress', 'Street address', true)}
          {field('streetAddress2', 'Street address 2')}
          <div className="grid grid-cols-2 gap-4">
            {field('postalCode', 'Postal code', true)}
            {field('city', 'City', true)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('region', 'Region')}
            {field('countryCode', 'Country code', true)}
          </div>
          {field('phoneNumber', 'Phone number')}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/bars"
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
