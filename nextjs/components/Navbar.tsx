"use client"

import { ReactNode } from 'react';

interface NavbarProps {
    children: ReactNode;
}

export default function Navbar({ children }: NavbarProps) {
    return (

        // NAVBAR
        <nav className="navbar sticky top-0 z-40">

            {/* NAVBAR CONTENT */}
            <div className="max-w-[80rem] mx-auto px-4 py-2 flex items-center justify-end gap-2">
                {children}
            </div>
        </nav>
    );
}
