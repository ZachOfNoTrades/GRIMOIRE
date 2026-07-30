"use client"

import { ReactNode, useCallback, useRef, useState } from 'react';
import PromptModal from '@/components/PromptModal';

export interface PromptOptions {
    title?: ReactNode;
    message?: ReactNode;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    zIndex?: number;
}

// Imperative, promise-based replacement for window.prompt().
//
//   const { prompt, promptModal } = usePrompt();
//   const name = await prompt({ title: 'New Location', placeholder: 'Name' });
//   if (!name) return; // null when cancelled, '' when submitted empty
//
// Render {promptModal} once anywhere in the component's JSX.
export function usePrompt() {

    // STATE: the active prompt request (null when closed)
    const [options, setOptions] = useState<PromptOptions | null>(null);

    // The pending promise resolver lives in a ref so settling never runs as a render side effect.
    const resolverRef = useRef<((value: string | null) => void) | null>(null);

    const prompt = useCallback((opts: PromptOptions = {}) => {
        return new Promise<string | null>((resolve) => {
            resolverRef.current = resolve;
            setOptions(opts);
        });
    }, []);

    const settle = useCallback((result: string | null) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setOptions(null);
        resolve?.(result);
    }, []);

    const promptModal = (
        <PromptModal
            isOpen={options !== null}
            title={options?.title}
            message={options?.message}
            placeholder={options?.placeholder}
            defaultValue={options?.defaultValue}
            confirmLabel={options?.confirmLabel}
            cancelLabel={options?.cancelLabel}
            zIndex={options?.zIndex}
            onSubmit={(value) => settle(value)}
            onCancel={() => settle(null)}
        />
    );

    return { prompt, promptModal };
}
