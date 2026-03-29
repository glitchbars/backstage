'use client';

import { Modal } from './Modal';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
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
          className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 cursor-pointer"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
