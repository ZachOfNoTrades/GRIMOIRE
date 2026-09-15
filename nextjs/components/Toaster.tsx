"use client"

import { CircleAlert, CircleCheck, Info, LoaderCircle } from 'lucide-react';
import { Toaster as HotToaster, type DefaultToastOptions, type ToasterProps } from 'react-hot-toast';

// Pages import `toast` and `Toaster` from here so every toast shares the alert-notice look
// (see the TOASTS section in globals.css). Position, timing and behavior stay per call site.
export { default, toast } from 'react-hot-toast';

// Per-type options replace the base ones rather than merging, so each type repeats the base class.
// A toast that passes its own `icon` keeps it.
const toastOptions: DefaultToastOptions = {
    className: 'toast',
    icon: <Info className="toast-icon" aria-hidden />,
    success: {
        className: 'toast toast-success',
        icon: <CircleCheck className="toast-icon" aria-hidden />,
    },
    error: {
        className: 'toast toast-error',
        icon: <CircleAlert className="toast-icon" aria-hidden />,
    },
    loading: {
        icon: <LoaderCircle className="toast-icon animate-spin" aria-hidden />,
    },
};

export function Toaster(props: ToasterProps) {
    return (
        <HotToaster
            {...props}
            toastOptions={{ ...toastOptions, ...props.toastOptions }}
        />
    );
}
