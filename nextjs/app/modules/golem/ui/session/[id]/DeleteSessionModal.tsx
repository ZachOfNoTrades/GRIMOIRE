"use client"

import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface DeleteSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    sessionName: string;
    isDeleting: boolean;
}

export default function DeleteSessionModal({
    isOpen,
    onClose,
    onConfirm,
    sessionName,
    isDeleting
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
            <p className="text-primary">
                Are you sure you want to delete <strong>{sessionName}</strong>? This action cannot be undone.
            </p>
        </Modal>
    );
}
