"use client";

import { useEffect, useRef, useState } from "react";

interface RangeValueProps {
  value: number;
  min: number;
  max: number;
  label: string; // what the number is, for assistive technology
  suffix?: string; // shown after the number, outside the editable part
  step?: number;
  onCommit: (value: number) => void;
}

// The number beside a slider. Click it to type an exact value: Enter or leaving the field applies
// it (kept between min and max), Escape puts it back.
export default function RangeValue({ value, min, max, label, suffix = "", step = 1, onCommit }: RangeValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  function commit() {
    setIsEditing(false);
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || text.trim() === "") return;
    const next = Math.min(max, Math.max(min, Math.round(parsed / step) * step));
    if (next !== value) onCommit(next);
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="orc-range-input"
        value={text}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          else if (event.key === "Escape") setIsEditing(false);
          event.stopPropagation();
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="orc-range-value orc-range-button"
      title="Click to type a value"
      aria-label={`${label}: ${value}${suffix}. Click to type a value`}
      onClick={() => {
        setText(String(value));
        setIsEditing(true);
      }}
    >
      {value}{suffix}
    </button>
  );
}
