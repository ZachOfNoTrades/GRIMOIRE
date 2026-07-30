"use client"

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface PromptModalProps {
    isOpen: boolean;
    onSubmit: (value: string) => void;
    onCancel: () => void;
    title?: ReactNode;
    message?: ReactNode;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    zIndex?: number;
}

// Reusable single-line text prompt — the in-app replacement for window.prompt().
// Most callers drive it imperatively through the usePrompt() hook.
export default function PromptModal({
    isOpen,
    onSubmit,
    onCancel,
    title = 'Enter a value',
    message,
    placeholder,
    defaultValue = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    zIndex,
}: PromptModalProps) {

    // INPUT
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset the draft to the default and focus the field each time the prompt opens.
    useEffect(() => {
        if (!isOpen) return;
        setValue(defaultValue);
        const timer = setTimeout(() => inputRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [isOpen, defaultValue]);

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

                    {/* SUBMIT BUTTON */}
                    <Button
                        onClick={() => onSubmit(value)}
                        className="btn-blue"
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {/* PROMPT MESSAGE */}
            {message && <p className="text-primary mb-3">{message}</p>}

            {/* PROMPT INPUT */}
            <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit(value);
                    if (e.key === 'Escape') onCancel();
                }}
                className="input-field w-full"
            />
        </Modal>
    );
}
