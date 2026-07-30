"use client"

import { X } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useAppHeight } from '@/lib/useAppHeight';


interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    subHeader?: ReactNode;
    disableClose?: boolean;
    fullHeight?: boolean;
    // Edge-to-edge cover that fills the whole visible viewport (no centered card,
    // no surrounding padding). Used by immersive flows like the food logger.
    fullScreen?: boolean;
    // Like fullScreen, but only below 640px — at desktop widths it falls back to
    // the standard centered card. Used by the food detail modal so phones keep the
    // immersive sheet while desktop gets a constrained dialog.
    fullScreenMobileOnly?: boolean;
    // Renders as a bottom-anchored action sheet (mobile style); tapping the backdrop closes it.
    sheet?: boolean;
    // Widens the centered card at desktop widths (>=768px) for two-column layouts
    // like the rune card editor. No effect on mobile — the card stays full-width.
    wide?: boolean;
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
    fullScreen = false,
    fullScreenMobileOnly = false,
    sheet = false,
    wide = false,
    zIndex,
    modalActions,
}: ModalProps) {

    // Portal to <body> so the fixed overlay isn't trapped by a transformed/filtered ancestor
    // (e.g. a card) — that would otherwise confine the "fixed" backdrop to the ancestor's box.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

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

    // Pin --app-height to the real visible viewport so the fixed overlay fills
    // the screen and the centered card's footer never hides behind a dynamic
    // toolbar (the modal CSS sizes the backdrop + card from this var). Firefox
    // Android needs special handling — see lib/useAppHeight for the rationale.
    useAppHeight();

    if (!isOpen || !mounted) return null;

    return createPortal(

        // BACKDROP
        <div
            className={`modal-backdrop${sheet ? ' modal-backdrop-sheet' : ''}${fullScreen ? ' modal-backdrop-screen' : ''}${fullScreenMobileOnly ? ' modal-backdrop-screen-mobile' : ''}`}
            style={zIndex ? { zIndex } : undefined}
            onClick={sheet && !disableClose ? onClose : undefined}
        >

            {/* MODAL CARD */}
            <div
                className={`modal-card${fullHeight ? ' modal-card-full' : ''}${sheet ? ' modal-card-sheet' : ''}${wide ? ' modal-card-wide' : ''}${fullScreen ? ' modal-card-screen' : ''}${fullScreenMobileOnly ? ' modal-card-screen-mobile' : ''}`}
                onClick={sheet ? (e) => e.stopPropagation() : undefined}
            >

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
        </div>,
        document.body
    );
}
