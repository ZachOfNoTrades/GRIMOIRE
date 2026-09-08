import React from "react";
import { useEffect } from "react";

// Shared input-field behaviors used across the app so number/text fields feel
// consistent on mobile (the primary target is Firefox Android).

// Select the input's current value on focus so tapping into a field replaces the
// value with one keystroke instead of forcing the user to backspace digits.
// Deferred via rAF because Safari clears the selection on mouseup if you call
// .select() synchronously in onFocus.
export function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  requestAnimationFrame(() => {
    try { el.select(); } catch {}
  });
}

// Move focus to another field on Enter so the on-screen keyboard stays up while
// the user advances through a short sequence of inputs. Pass the next field's
// element id; the target is focused and (by default) its value selected — pass
// { select: false } for text fields where appending is more common than
// replacing. The last field in a sequence should use blurOnEnter instead to
// close the keyboard.
export function focusOnEnter(nextId: string, opts?: { select?: boolean }) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const next = document.getElementById(nextId) as HTMLInputElement | null;
      if (next) {
        next.focus();
        if (opts?.select !== false) {
          try { next.select(); } catch {}
        }
      }
    }
  };
}

// Blur the field on Enter so the on-screen keyboard closes instead of the
// keypress doing nothing (or triggering an unintended form submit). Modifier
// chords are left alone; attach this only to single-line <input> elements, never
// a <textarea> where Enter means newline.
export function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

// Run a submit action on Enter, for the LAST field of a short create form that
// has an explicit submit button (quest's reward/debt/ad-hoc rows). It blurs first
// so the on-screen keyboard closes exactly like blurOnEnter, then fires the
// action — the values already live in React state, so blurring can't lose them.
// Use focusOnEnter for the earlier fields of the sequence and this for the last.
export function submitOnEnter(submit: () => void) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.currentTarget.blur();
      submit();
    }
  };
}

// Blur the currently-focused <input>/<textarea> as soon as the user scrolls a
// given surface, so on mobile the on-screen keyboard drops out of the way the
// moment they start panning (matching the native scroll-to-dismiss feel).
//
// `withinSelector` scopes this to one scroll surface: the gesture only counts
// when it lands inside an element matching the selector (e.g. ".modal-body").
// Scoping matters — applying this app-wide would fight the diary's
// keyboard-centering effect, which calls scrollIntoView() right after focusing
// an inline field.
//
// We listen for genuine user-scroll GESTURES (touchmove / wheel) rather than the
// `scroll` event on purpose: `scroll` also fires for programmatic scrolling and
// for the reflow when the on-screen keyboard opens, either of which would blur
// the field that was just focused. Touch/wheel only fire for real user intent.
// A gesture that starts on the focused field itself (cursor drag / selection
// handles) is left alone via the contains() guard.
export function useBlurActiveInputOnScroll(opts?: {
  withinSelector?: string;
  enabled?: boolean;
}) {
  const withinSelector = opts?.withinSelector;
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const blurActiveInput = (event: Event) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const tag = active.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      // Don't blur when the gesture started on the focused field itself — the
      // user may be dragging the cursor / selection inside it, not scrolling.
      if (active.contains(target)) return;
      // Only react to scrolls on the surface we were scoped to.
      if (withinSelector) {
        const el = target instanceof Element ? target : target.parentElement;
        if (!el?.closest(withinSelector)) return;
      }
      active.blur();
    };

    // Capture phase + passive: catch scrolls inside nested scrollers without
    // blocking the scroll itself.
    const listenerOpts: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener("touchmove", blurActiveInput, listenerOpts);
    document.addEventListener("wheel", blurActiveInput, listenerOpts);
    return () => {
      document.removeEventListener("touchmove", blurActiveInput, listenerOpts);
      document.removeEventListener("wheel", blurActiveInput, listenerOpts);
    };
  }, [enabled, withinSelector]);
}
