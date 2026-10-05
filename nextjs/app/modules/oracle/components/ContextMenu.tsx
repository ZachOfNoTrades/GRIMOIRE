"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuChoice {
  key: string;
  label: string;
  icon?: ReactNode;
  title?: string;
}

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect?: () => void;
  // A row of alternatives under the label, one of which is current. Used where the choice is
  // between states rather than a single thing to do, so the DM sees all of them at once instead
  // of a button whose meaning depends on where it is now.
  choices?: ContextMenuChoice[];
  chosen?: string;
  onChoose?: (key: string) => void;
}

interface ContextMenuProps {
  x: number; // viewport position of the right-click
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// A small menu at the pointer. Any press outside it, Escape, a scroll or a resize closes it.
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu on screen: flip it back from the right and bottom edges.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) });
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event.type === "pointerdown" && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="orc-context" role="menu" style={position} onContextMenu={(event) => event.preventDefault()}>
      {items.map((item) =>
        item.choices ? (
          <div key={item.label} className="orc-context-choice" role="group" aria-label={item.label}>
            <p className="orc-context-choice-label">{item.label}</p>
            <div className="orc-context-choice-row">
              {item.choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.chosen === choice.key}
                  className="orc-context-choice-item"
                  title={choice.title}
                  onClick={() => {
                    onClose();
                    item.onChoose?.(choice.key);
                  }}
                >
                  {choice.icon}
                  <span>{choice.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="orc-context-item"
            data-danger={item.danger ? "true" : undefined}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}
