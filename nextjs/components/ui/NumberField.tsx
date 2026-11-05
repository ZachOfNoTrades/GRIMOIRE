"use client";

import { FocusEvent, InputHTMLAttributes, useState } from "react";
import { formatNumberDraft, parseNumberDraft, settleNumberDraft } from "@/lib/numberDraft";

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"> & {
  value: number | null;
  onValueChange: (next: number | null) => void; // null while the field is empty or half typed
  min?: number;
  max?: number;
  integer?: boolean; // Round to a whole number when the field is left
};

// A NumberField is a number input that holds the text as typed, to avoid a 0 or a limit reappearing in a field being emptied.
// Its min, max and whole-number limits apply when the field is left, never on a keystroke.
export default function NumberField({ value, onValueChange, min, max, integer, type = "number", onBlur, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(formatNumberDraft(value));
  const [shownValue, setShownValue] = useState(value);

  // Follow a value set from outside the field, such as a load or a reset
  if (value !== shownValue) {
    setShownValue(value);
    if (value !== parseNumberDraft(text)) setText(formatNumberDraft(value));
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const settled = settleNumberDraft(text, { min, max, integer });
    setText(formatNumberDraft(settled));
    if (settled !== value) onValueChange(settled);
    onBlur?.(event);
  }

  return (

    // NUMBER INPUT
    <input
      {...rest}
      type={type}
      min={min}
      max={max}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onValueChange(parseNumberDraft(event.target.value));
      }}
      onBlur={handleBlur}
    />
  );
}
