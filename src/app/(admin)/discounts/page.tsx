'use client';

import { useEffect, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useBarFilter } from '@/components/BarFilterContext';

interface Discount {
    id: string;
    name: string;
    percentBps: number;
    active: boolean;
    barId: string;
    bar: { name: string };
}

interface Bar {
    id: string;
    name: string;
}

interface PageResult {
    data: Discount[];
    total: number;
    page: number;
    pageSize: number;
}

const DEFAULT_FORM = {
    barId: '',
    name: '',
    percent: '',
    active: true,
};

type FormState = typeof DEFAULT_FORM;

export default function DiscountsPage() {
    const { barId: filterBarId, setBarId: setFilterBarId } = useBarFilter();
    const [result, setResult] = useState<PageResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [bars, setBars] = useState<Bar[]>([]);
    const [page, setPage] = useState(1);
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState<Discount | null>(null);
    const [form, setForm] = useState<FormState>(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        fetch('/api/bars/all')
            .then((r) => r.json())
            .then((data: Bar[]) => {
                setBars(data);
                if (data.length > 0) setForm((f) => ({ ...f, barId: f.barId || data[0].id }));
            });
    }, []);

    async function fetchDiscounts(p = page, barId = filterBarId) {
        setLoading(true);
        const params = new URLSearchParams({ page: String(p), pageSize: '20' });
        if (barId) params.set('barId', barId);
        const res = await fetch(`/api/discounts?${params}`);
        setResult(await res.json());
        setLoading(false);
    }

    useEffect(() => {
        fetchDiscounts(page, filterBarId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, filterBarId]);

    function openCreate() {
        setEditing(null);
        setError(null);
        setForm({ ...DEFAULT_FORM, barId: filterBarId || bars[0]?.id || '' });
        setShowCreate(true);
    }

    function openEdit(discount: Discount) {
        setEditing(discount);
        setError(null);
        setForm({
            barId: discount.barId,
            name: discount.name,
            percent: String(discount.percentBps / 100),
            active: discount.active,
        });
        setShowCreate(true);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        const percent = Number(form.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
            setError('Percent must be between 0 and 100');
            return;
        }

        setSaving(true);
        setError(null);
        const payload = {
            barId: form.barId,
            name: form.name.trim(),
            percentBps: Math.round(percent * 100),
            active: form.active,
        };

        const res = await fetch(editing ? `/api/discounts/${editing.id}` : '/api/discounts', {
            method: editing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setSaving(false);

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body.error ?? 'Could not save discount');
            return;
        }

        setShowCreate(false);
        setEditing(null);
        setForm(DEFAULT_FORM);
        fetchDiscounts(editing ? page : 1, filterBarId);
        if (!editing) setPage(1);
    }

    async function handleDelete(id: string) {
        await fetch(`/api/discounts/${id}`, { method: 'DELETE' });
        fetchDiscounts(page, filterBarId);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Discounts</h1>
                <button
                    onClick={openCreate}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
                >
                    + New Discount
                </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
                <select
                    value={filterBarId}
                    onChange={(e) => {
                        setFilterBarId(e.target.value);
                        setPage(1);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                    <option value="">All bars</option>
                    {bars.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Bar</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Percent</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    {loading ? (
                        <TableSkeleton columns={5} />
                    ) : (
                        <tbody className="divide-y divide-gray-100">
                            {result?.data.map((discount) => (
                                <tr key={discount.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{discount.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{discount.bar.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{discount.percentBps / 100}%</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${discount.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                                }`}
                                        >
                                            {discount.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button
                                            onClick={() => openEdit(discount)}
                                            className="text-blue-600 hover:underline cursor-pointer"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete({ id: discount.id, name: discount.name })}
                                            className="text-red-600 hover:underline cursor-pointer"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {result?.data.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                                        No discounts found
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
                        onPageChange={setPage}
                    />
                )}
            </div>

            {showCreate && (
                <Modal
                    title={editing ? 'Edit Discount' : 'New Discount'}
                    onClose={() => setShowCreate(false)}
                >
                    <form onSubmit={handleSave} className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Bar <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={form.barId}
                                onChange={(e) => setForm({ ...form, barId: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            >
                                <option value="">Select a bar</option>
                                {bars.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Employee"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Percent off <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                type="number"
                                min="0.01"
                                max="100"
                                step="0.01"
                                value={form.percent}
                                onChange={(e) => setForm({ ...form, percent: e.target.value })}
                                placeholder="10"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={form.active}
                                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                            />
                            Active
                        </label>

                        {error && <p className="text-sm text-red-600">{error}</p>}

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {confirmDelete && (
                <ConfirmModal
                    title="Delete Discount"
                    message={`Delete discount "${confirmDelete.name}"? Orders that already used it keep their discount.`}
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
