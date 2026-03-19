"use client"

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface ReviewSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (review: string) => void;
    isSaving: boolean;
}

export default function ReviewSessionModal({
    isOpen,
    onClose,
    onSubmit,
    isSaving
}: ReviewSessionModalProps) {
    // INPUT
    const [review, setReview] = useState("");

    // Reset textarea when modal opens
    useEffect(() => {
        if (isOpen) setReview("");
    }, [isOpen]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Session Review"
            disableClose={isSaving}
            footer={
                <>
                    {/* SKIP BUTTON */}
                    <Button
                        onClick={onClose}
                        disabled={isSaving}
                        className="btn-link"
                    >
                        Skip
                    </Button>

                    {/* SAVE BUTTON */}
                    <Button
                        onClick={() => onSubmit(review)}
                        disabled={isSaving}
                        className="btn-blue"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                </>
            }
        >
            {/* REVIEW TEXTAREA */}
            <textarea
                className="input w-full min-h-[120px] resize-y"
                placeholder="How did it go?"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                disabled={isSaving}
            />
        </Modal>
    );
}
