"use client"

import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface SubModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    disableClose?: boolean;
}

export default function SubModal({
    isOpen,
    onClose,
    title,
    children,
    footer,
    disableClose = false
}: SubModalProps) {

    if (!isOpen) return null;

    return (

        // BACKDROP
        <div className="modal-backdrop !z-[60]">

            {/* SUB-MODAL CARD */}
            <div className="modal-card-compact">

                {/* SUB-MODAL HEADER */}
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

                {/* SUB-MODAL BODY */}
                <div className="modal-body">
                    {children}
                </div>

                {/* SUB-MODAL FOOTER (optional) */}
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
