"use client"

import { X } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
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
    // Raises the card's cap from 85% to 95% of the visible viewport, for long forms that would
    // otherwise scroll a lot inside a short card (e.g. the quest task editor).
    tall?: boolean;
    // On mobile, the title takes its own full-width top row and modalActions wrap onto a row
    // beneath it, so a crowded controls group can never squeeze the title out.
    stackedHeader?: boolean;
    // On mobile, dragging the header down closes the modal. Pair with fullScreenMobileOnly.
    swipeDownToClose?: boolean;
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
    tall = false,
    stackedHeader = false,
    swipeDownToClose = false,
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
    // the screen and the centered card's footer never hides behind the soft
    // keyboard (the modal CSS sizes the backdrop + card from this var).
    useAppHeight();

    // SWIPE DOWN TO CLOSE
    const [dragOffset, setDragOffset] = useState(0); // px the card is pulled down
    const [isDragging, setIsDragging] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);
    const dragStartYRef = useRef<number | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const SWIPE_CLOSE_DISTANCE = 100; // px

    // Reset drag state whenever the modal opens or closes; clear any pending dismiss timer on unmount
    useEffect(() => {
        setDragOffset(0);
        setIsDragging(false);
        setIsDismissing(false);
        dragStartYRef.current = null;
    }, [isOpen]);
    useEffect(() => () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); }, []);

    const handleHeaderTouchStart = (event: React.TouchEvent) => {
        if (!swipeDownToClose || disableClose || isDismissing || window.innerWidth >= 640) return;
        dragStartYRef.current = event.touches[0].clientY;
        setIsDragging(true);
    };

    const handleHeaderTouchMove = (event: React.TouchEvent) => {
        if (dragStartYRef.current === null) return;
        setDragOffset(Math.max(0, event.touches[0].clientY - dragStartYRef.current));
    };

    const handleHeaderTouchEnd = () => {
        if (dragStartYRef.current === null) return;
        dragStartYRef.current = null;
        setIsDragging(false);
        if (dragOffset < SWIPE_CLOSE_DISTANCE) {
            setDragOffset(0); // snap back
            return;
        }
        setIsDismissing(true); // slide off screen, then close
        setDragOffset(window.innerHeight);
        dismissTimerRef.current = setTimeout(onClose, 200);
    };

    if (!isOpen || !mounted) return null;

    const dragStyle = dragOffset > 0 || isDismissing
        ? { transform: `translateY(${dragOffset}px)`, transition: isDragging ? 'none' : 'transform 200ms ease-out' }
        : undefined;

    return createPortal(

        // BACKDROP
        <div
            className={`modal-backdrop${sheet ? ' modal-backdrop-sheet' : ''}${fullScreen ? ' modal-backdrop-screen' : ''}${fullScreenMobileOnly ? ' modal-backdrop-screen-mobile' : ''}`}
            style={zIndex ? { zIndex } : undefined}
            onClick={sheet && !disableClose ? onClose : undefined}
        >

            {/* MODAL CARD */}
            <div
                className={`modal-card${fullHeight ? ' modal-card-full' : ''}${sheet ? ' modal-card-sheet' : ''}${wide ? ' modal-card-wide' : ''}${tall ? ' modal-card-tall' : ''}${fullScreen ? ' modal-card-screen' : ''}${fullScreenMobileOnly ? ' modal-card-screen-mobile' : ''}`}
                style={dragStyle}
                onClick={sheet ? (e) => e.stopPropagation() : undefined}
            >

                {/* MODAL HEADER */}
                <div
                    className={`modal-header${stackedHeader ? ' modal-header-stacked' : ''}`}
                    onTouchStart={handleHeaderTouchStart}
                    onTouchMove={handleHeaderTouchMove}
                    onTouchEnd={handleHeaderTouchEnd}
                    onTouchCancel={handleHeaderTouchEnd}
                    style={swipeDownToClose ? { touchAction: 'none' } : undefined}
                >
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
