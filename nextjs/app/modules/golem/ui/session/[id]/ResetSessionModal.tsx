"use client"

import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface ResetSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    sessionName: string;
    isResetting: boolean;
}

export default function ResetSessionModal({
    isOpen,
    onClose,
    onConfirm,
    sessionName,
    isResetting
}: ResetSessionModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Reset Session"
            disableClose={isResetting}
            footer={
                <>
                    {/* CANCEL BUTTON */}
                    <Button
                        onClick={onClose}
                        disabled={isResetting}
                        className="btn-link"
                    >
                        Cancel
                    </Button>

                    {/* RESET BUTTON */}
                    <Button
                        onClick={onConfirm}
                        disabled={isResetting}
                        className="btn-red"
                    >
                        {isResetting ? 'Resetting...' : 'Reset'}
                    </Button>
                </>
            }
        >
            <p className="text-primary">
                Are you sure you want to reset <strong>{sessionName}</strong>? This will clear all logged sets, duration, and review data. Target exercises will be preserved.
            </p>
        </Modal>
    );
}
