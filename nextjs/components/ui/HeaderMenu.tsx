"use client";

import { EllipsisVertical } from "lucide-react";
import { Fragment, useRef, useState, type ReactNode } from "react";
import PopoverMenu from "@/components/PopoverMenu";
import { Button } from "./button";

export interface HeaderMenuItem {
    label: string;
    icon: ReactNode;
    onSelect: () => void;
    danger?: boolean; // a destructive action reads red before it is clicked
    disabled?: boolean;
    title?: string; // hover tooltip for an action whose label can't say everything it does
    separatorBefore?: boolean; // a rule above the item, setting it apart from the group before it
}

interface HeaderMenuProps {
    items: (HeaderMenuItem | false | null | undefined)[]; // falsy entries are skipped, so conditional items can sit inline
    id?: string;
    label?: string; // screen-reader name; "More actions" by default
    disabled?: boolean; // the trigger itself, e.g. while the record is still loading
    wide?: boolean; // the wider popover, for longer item labels
}

// The "more" menu on a page or record header: the vertical dots as a transparent button, opening
// the shared popover. It holds the header's rarer actions (reset, archive, delete) so the one
// primary action beside it stands alone.
export const HeaderMenu = ({ items, id, label = "More actions", disabled, wide }: HeaderMenuProps) => {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const shownItems = items.filter((item): item is HeaderMenuItem => !!item);

    return (
        <>
            {/* MENU TRIGGER */}
            <div ref={anchorRef}>
                <Button id={id} className="btn-link" title="More" aria-label={label} aria-haspopup="menu" aria-expanded={isOpen} disabled={disabled} onClick={() => setIsOpen((open) => !open)}>
                    <EllipsisVertical className="w-5 h-5" aria-hidden />
                </Button>
            </div>

            {/* MENU POPOVER */}
            <PopoverMenu open={isOpen} onClose={() => setIsOpen(false)} anchorRef={anchorRef} className={wide ? "popover-menu--wide" : undefined}>
                {shownItems.map((item, index) => (
                    <Fragment key={index}>
                        {item.separatorBefore && <div className="popover-separator" />}
                        <button
                            type="button"
                            role="menuitem"
                            className={item.danger ? "popover-item popover-item-danger text-left" : "popover-item text-left"}
                            disabled={item.disabled}
                            title={item.title}
                            onClick={() => {
                                setIsOpen(false);
                                item.onSelect();
                            }}
                        >
                            <span className="mr-3 inline-flex" aria-hidden>{item.icon}</span>
                            {item.label}
                        </button>
                    </Fragment>
                ))}
            </PopoverMenu>
        </>
    );
};
