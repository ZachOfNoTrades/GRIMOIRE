"use client";

import { EllipsisVertical } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import PopoverMenu from "@/components/PopoverMenu";
import { Button } from "./button";

export interface HeaderMenuItem {
    label: string;
    icon: ReactNode;
    onSelect: () => void;
    danger?: boolean; // a destructive action reads red before it is clicked
    disabled?: boolean;
}

interface HeaderMenuProps {
    items: HeaderMenuItem[];
    id?: string;
    label?: string; // screen-reader name; "More actions" by default
}

// The "more" menu on a page or record header: the vertical dots as a transparent button, opening
// the shared popover. It holds the header's rarer actions (reset, archive, delete) so the one
// primary action beside it stands alone.
export const HeaderMenu = ({ items, id, label = "More actions" }: HeaderMenuProps) => {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* MENU TRIGGER */}
            <div ref={anchorRef}>
                <Button id={id} className="btn-link" title="More" aria-label={label} aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
                    <EllipsisVertical className="w-5 h-5" aria-hidden />
                </Button>
            </div>

            {/* MENU POPOVER */}
            <PopoverMenu open={isOpen} onClose={() => setIsOpen(false)} anchorRef={anchorRef}>
                {items.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        className={item.danger ? "popover-item popover-item-danger" : "popover-item"}
                        disabled={item.disabled}
                        onClick={() => {
                            setIsOpen(false);
                            item.onSelect();
                        }}
                    >
                        <span className="mr-3 inline-flex" aria-hidden>{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </PopoverMenu>
        </>
    );
};
