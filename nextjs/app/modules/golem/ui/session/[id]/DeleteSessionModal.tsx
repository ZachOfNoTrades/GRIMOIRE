"use client"

import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface DeleteSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    sessionName: string;
    isDeleting: boolean;
    error?: string | null;
}

export default function DeleteSessionModal({
    isOpen,
    onClose,
    onConfirm,
    sessionName,
    isDeleting,
    error,
}: DeleteSessionModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Delete Session"
            disableClose={isDeleting}
            footer={
                <>
                    {/* CANCEL BUTTON */}
                    <Button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="btn-link"
                    >
                        Cancel
                    </Button>

                    {/* DELETE BUTTON */}
                    <Button
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="btn-red"
                    >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </>
            }
        >
            {/* BODY */}
            <div className="flex flex-col gap-2">

                {/* MESSAGE */}
                <p className="text-primary">
                    Are you sure you want to delete <strong>{sessionName}</strong>? This action cannot be undone.
                </p>

                {/* ERROR */}
                {error && <p className="text-sm text-alert-red">{error}</p>}
            </div>
        </Modal>
    );
}
