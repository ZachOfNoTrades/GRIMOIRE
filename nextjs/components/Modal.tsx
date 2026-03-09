"use client"

import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    subHeader?: ReactNode;
    disableClose?: boolean;
    fullHeight?: boolean;
    zIndex?: number;
    modalActions?: ReactNode;
}

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    footer,
    subHeader,
    disableClose = false,
    fullHeight = false,
    zIndex,
    modalActions,
}: ModalProps) {

    // Lock background scroll when modal is open
    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            // Only restore scroll if no other modals remain
            if (document.querySelectorAll('.modal-backdrop').length === 0) {
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            }
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (

        // BACKDROP
        <div className="modal-backdrop" style={zIndex ? { zIndex } : undefined}>

            {/* MODAL CARD */}
            <div className={`modal-card${fullHeight ? ' modal-card-full' : ''}`}>

                {/* MODAL HEADER */}
                <div className="modal-header">
                    <h2 className='text-modal-title'>{title}</h2>

                    {/* MODAL ACTIONS */}
                    {modalActions ?? (
                        <Button
                            onClick={onClose}
                            className="btn-link"
                            disabled={disableClose}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    )}
                </div>

                {/* SUB HEADER */}
                {subHeader}

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
