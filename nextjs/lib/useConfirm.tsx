"use client"

import { ReactNode, useCallback, useRef, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';

export interface ConfirmOptions {
    message: ReactNode;
    title?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    zIndex?: number;
}

// Imperative, promise-based replacement for window.confirm().
//
//   const { confirm, confirmModal } = useConfirm();
//   if (!(await confirm({ message: 'Delete this?', danger: true }))) return;
//
// Render {confirmModal} once anywhere in the component's JSX.
export function useConfirm() {

    // STATE: the active confirm request (null when closed)
    const [options, setOptions] = useState<ConfirmOptions | null>(null);

    // The pending promise resolver lives in a ref so settling never runs as a render side effect.
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
            setOptions(opts);
        });
    }, []);

    const settle = useCallback((result: boolean) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setOptions(null);
        resolve?.(result);
    }, []);

    const confirmModal = (
        <ConfirmModal
            isOpen={options !== null}
            message={options?.message ?? ''}
            title={options?.title}
            confirmLabel={options?.confirmLabel}
            cancelLabel={options?.cancelLabel}
            danger={options?.danger}
            zIndex={options?.zIndex}
            onConfirm={() => settle(true)}
            onCancel={() => settle(false)}
        />
    );

    return { confirm, confirmModal };
}
