"use client";

import { HelpCircle } from "lucide-react";
import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

// A single block of help copy: an optional heading and its body content.
export interface HelpSection {
    heading?: string;
    body: ReactNode;
}

interface HelpButtonProps {
    // Modal title, e.g. "Workout Tracker". Rendered as "<title> help".
    title: string;
    // Ordered help sections shown in the modal body.
    sections: HelpSection[];
    // Trigger button variant class (default "btn-link"). Lets pages match local styling.
    className?: string;
    // Accessible label / tooltip for the trigger (default "Help").
    label?: string;
    // Controlled mode, for opening the help from somewhere else (e.g. a menu item): pass `open`
    // and `onOpenChange`, and `hideTrigger` to render only the modal.
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
}

// Reusable help affordance: a "?" icon button that opens a short in-app
// documentation modal describing the current module/page. Self-contained —
// it owns its open state and renders both the trigger and the Modal, so a
// page only needs to drop in <HelpButton title=... sections=... />.
export default function HelpButton({
    title,
    sections,
    className = "btn-link",
    label = "Help",
    open,
    onOpenChange,
    hideTrigger = false,
}: HelpButtonProps) {

    // STATE
    const [ownOpen, setOwnOpen] = useState(false);
    const isOpen = open ?? ownOpen;
    const setIsOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwnOpen(next));

    return (

        // HELP AFFORDANCE
        <>

            {/* HELP TRIGGER */}
            {!hideTrigger && (
                <Button
                    className={className}
                    onClick={() => setIsOpen(true)}
                    aria-label={label}
                    title={label}
                >
                    <HelpCircle className="w-5 h-5" />
                </Button>
            )}

            {/* HELP MODAL */}
            <Modal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={`${title} help`}
                sheet
            >

                {/* HELP SECTIONS */}
                <div className="help-doc">
                    {sections.map((section, index) => (

                        // HELP SECTION
                        <div className="help-section" key={index}>

                            {/* HELP HEADING */}
                            {section.heading && (
                                <div className="help-heading">{section.heading}</div>
                            )}

                            {/* HELP BODY */}
                            <div className="help-body">{section.body}</div>
                        </div>
                    ))}
                </div>
            </Modal>
        </>
    );
}
