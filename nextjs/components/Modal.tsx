"use client"

import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    disableClose?: boolean;
}

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    footer,
    disableClose = false
}: ModalProps) {

    if (!isOpen) return null;

    return (

        // BACKDROP
        <div className="modal-backdrop">

            {/* MODAL CARD */}
            <div className="modal-card">

                {/* MODAL HEADER */}
                <div className="modal-header">
                    <h2 className='text-modal-title'>{title}</h2>

                    {/* CLOSE BUTTON */}
                    <Button
                        onClick={onClose}
                        className="btn-link"
                        disabled={disableClose}
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* MODAL BODY */}
                <div className="modal-body">
                    {children}
                </div>

                {/* MODAL FOOTER (optional) */}
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
