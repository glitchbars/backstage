'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';

interface Address {
  city: string;
  countryCode: string;
}

interface Bar {
  id: string;
  name: string;
  address: Address;
  createdAt: string;
}

interface PageResult {
  data: Bar[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_FORM = {
  name: '',
  streetAddress: '',
  streetAddress2: '',
  postalCode: '',
  city: '',
  region: '',
  countryCode: '',
  phoneNumber: '',
};

export default function BarsPage() {
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  async function fetchBars(p = page) {
    setLoading(true);
    const res = await fetch(`/api/bars?page=${p}&pageSize=20`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchBars(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handlePageChange(p: number) {
    setPage(p);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/bars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
    fetchBars(1);
    setPage(1);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/bars/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    fetchBars(page);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bars</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
        >
          + New Bar
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">City</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Country</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton columns={5} />
          ) : (
            <tbody className="divide-y divide-gray-100">
              {result?.data.map((bar) => (
                <tr key={bar.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{bar.name}</td>
                  <td className="px-4 py-3 text-gray-600">{bar.address.city}</td>
                  <td className="px-4 py-3 text-gray-600">{bar.address.countryCode}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(bar.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link href={`/bars/${bar.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <button
                      onClick={() => setConfirmDelete({ id: bar.id, name: bar.name })}
                      disabled={deletingId === bar.id}
                      className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {result?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No bars found
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
        {result && (
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      {showCreate && (
        <Modal title="New Bar" onClose={() => setShowCreate(false)}>
          <BarForm
            form={form}
            setForm={setForm}
            onSubmit={handleCreate}
            saving={saving}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Bar"
          message={`Delete bar "${confirmDelete.name}"? This action cannot be undone.`}
          onConfirm={() => {
            handleDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function BarForm({
  form,
  setForm,
  onSubmit,
  saving,
  onCancel,
}: {
  form: typeof DEFAULT_FORM;
  setForm: (f: typeof DEFAULT_FORM) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  function field(key: keyof typeof DEFAULT_FORM, label: string, required = false) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type="text"
          required={required}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {field('name', 'Bar name', true)}
      {field('streetAddress', 'Street address', true)}
      {field('streetAddress2', 'Street address 2')}
      <div className="grid grid-cols-2 gap-3">
        {field('postalCode', 'Postal code', true)}
        {field('city', 'City', true)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('region', 'Region')}
        {field('countryCode', 'Country code', true)}
      </div>
      {field('phoneNumber', 'Phone number')}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
