'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Search, X } from 'lucide-react';

// The single search input for the whole app: magnifier on the left, a clear
// button on the right that only exists while there is text.
//
// It exists because the clear affordance used to be the *browser's*. Every
// search box here was a bare <input>, and the ones typed `search` inherited
// Chromium's ::-webkit-search-cancel-button — an unstyled blue glyph that
// matched nothing in the design system, ignored the theme tokens, and (since
// Gecko has never implemented it) was simply absent on Firefox, the primary
// target. The other half of the app's search boxes were typed `text` and so
// offered no way to clear at all. One component, one styled button, both
// engines — see `.search-field*` in globals.css, which also suppresses the
// native glyph app-wide so it can never come back.

// What the shared matcher (lib/searchMatch.ts) actually does, in one line the
// user can hover. Exported so the call sites that USE that matcher can all
// point at the same string and the copy can't drift from the behaviour — and
// so the ones that don't (forage's food/recipe search runs in SQL with
// different rules) are not silently mislabelled with it.
export const SMART_MATCH_HINT = 'Words can be in any order. Units match either way — 5" also finds "5 inch".';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Defaults to the placeholder — a search box's placeholder ("Search cards…")
  // already reads as its label, so most callers need not repeat themselves.
  ariaLabel?: string;
  id?: string;
  // Extra classes/styles for the wrapper and the input respectively, so a
  // caller with its own layout (grid cell, flex child, pill chrome) can place
  // the field without the component guessing.
  className?: string;
  inputClassName?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  autoCapitalize?: string;
  autoFocus?: boolean;
  // Hover/long-press hint describing how matching works. Opt-in: a caller
  // filtering with the shared matcher passes SMART_MATCH_HINT, one with its own
  // rules passes its own string, and anything else gets no tooltip rather than
  // a promise its search does not keep.
  matchHint?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel,
  id,
  className = '',
  inputClassName = '',
  style,
  inputStyle,
  autoCapitalize,
  autoFocus,
  onKeyDown,
  matchHint,
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  return (

    /* SEARCH FIELD — relative box the icon and clear button are pinned inside */
    <div className={`search-field ${className}`.trim()} style={style}>

      {/* MAGNIFIER — decoration only; clicks fall through to the input */}
      <Search className="search-field-icon w-4 h-4" aria-hidden="true" />

      {/* INPUT — `search` (not `text`) so mobile keyboards offer a search key
          and assistive tech announces the role; the UA's own cancel glyph is
          suppressed in CSS in favour of the button below. */}
      <input
        ref={inputRef}
        id={id}
        type="search"
        className={`input-field search-field-input ${inputClassName}`.trim()}
        style={inputStyle}
        placeholder={placeholder}
        title={matchHint}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoCapitalize={autoCapitalize}
        autoFocus={autoFocus}
      />

      {/* CLEAR BUTTON — only while there is something to clear, so the field is
          not permanently carrying a dead control. Refocuses the input rather
          than blurring: clearing is nearly always the start of a new query, and
          on mobile a blur would drop the keyboard the user is about to reuse. */}
      {value !== '' && (
        <button
          type="button"
          className="search-field-clear"
          title="Clear search"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
