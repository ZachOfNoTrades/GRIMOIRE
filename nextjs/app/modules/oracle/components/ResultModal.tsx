"use client";

import { Pin, PinOff, ScrollText, X } from "lucide-react";
import { useEffect } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import type { ChipOption, TextChipContent } from "../types/oracle";

interface ResultModalProps {
  content: TextChipContent | null; // null = closed
  isLoading?: boolean; // an answer is being generated (command bar)
  loadingTitle?: string;
  // Banner items can be pinned or dismissed; an answer from the command bar cannot.
  pinState?: boolean | null;
  onPin?: (isPinned: boolean) => void;
  onDismiss?: () => void;
  onUse: (option: ChipOption, title: string) => void; // logs the chosen answer
  onClose: () => void;
}

// A prepared answer: up to three alternatives. Choosing one writes it to the session log, so
// whatever was improvised at the table is on record afterwards.
export default function ResultModal({ content, isLoading = false, loadingTitle, pinState = null, onPin, onDismiss, onUse, onClose }: ResultModalProps) {
  const isOpen = content !== null || isLoading;

  // Number keys choose an option, as on the banner's hints.
  useEffect(() => {
    if (!content) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const index = Number(event.key) - 1;
      if (content && Number.isInteger(index) && index >= 0 && index < content.options.length) {
        event.preventDefault();
        onUse(content.options[index], content.title);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, onUse]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={content?.title ?? loadingTitle ?? "Thinking…"}
      footer={
        content ? (
          <div className="orc-footer">

            {/* HINT */}
            <span className="text-secondary orc-small">Pick one to log it.</span>

            {/* ACTIONS */}
            <div className="orc-footer-actions">
              {pinState !== null && onPin && (
                <Button className="btn-off" onClick={() => onPin(!pinState)}>
                  {pinState ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />} {pinState ? "Unpin" : "Pin"}
                </Button>
              )}
              {onDismiss && (
                <Button className="btn-off" onClick={onDismiss}>
                  <X className="w-4 h-4" /> Dismiss
                </Button>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      {/* LOADING PLACEHOLDER */}
      {isLoading && !content && <p className="text-secondary">Working on it…</p>}

      {/* OPTIONS — no field to focus: the modal is for reading and choosing, so nothing is autofocused */}
      {content && (
        <div className="orc-options">
          {content.options.map((option, index) => (

            // OPTION
            <button key={index} type="button" className="orc-option" onClick={() => onUse(option, content.title)}>

              {/* OPTION NUMBER */}
              <span className="orc-kbd">{index + 1}</span>

              {/* OPTION BODY */}
              <span className="orc-option-body">
                {option.tone && <span className="orc-option-tone">{option.tone}</span>}
                <span className="orc-option-text">{option.text}</span>
                {option.note && <span className="orc-option-note">{option.note}</span>}
              </span>

              {/* LOG ICON */}
              <ScrollText className="w-4 h-4 orc-option-log" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
