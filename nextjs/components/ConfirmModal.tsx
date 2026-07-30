"use client"

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface ConfirmModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    message: ReactNode;
    title?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    // Destructive actions render the confirm button in red.
    danger?: boolean;
    // Lets the dialog stack above an already-open modal (base backdrop is z-index 50).
    zIndex?: number;
}

// Reusable yes/no confirmation dialog — the in-app replacement for window.confirm().
// Most callers drive it imperatively through the useConfirm() hook.
export default function ConfirmModal({
    isOpen,
    onConfirm,
    onCancel,
    message,
    title = 'Are you sure?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    zIndex,
}: ConfirmModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={title}
            zIndex={zIndex}
            footer={
                <>
                    {/* CANCEL BUTTON */}
                    <Button
                        onClick={onCancel}
                        className="btn-link"
                    >
                        {cancelLabel}
                    </Button>

                    {/* CONFIRM BUTTON */}
                    <Button
                        onClick={onConfirm}
                        className={danger ? 'btn-red' : 'btn-blue'}
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {/* CONFIRM MESSAGE */}
            <p className="text-primary">{message}</p>
        </Modal>
    );
}
