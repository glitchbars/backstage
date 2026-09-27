'use client';

import { Modal } from './Modal';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  destructive?: boolean;
}

export function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  destructive = true,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 text-sm text-white rounded-md cursor-pointer ${
            destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
