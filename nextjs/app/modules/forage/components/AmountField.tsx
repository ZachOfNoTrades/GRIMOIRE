"use client";

import { InputHTMLAttributes } from "react";
import { sanitizeAmountInput } from "../lib/format";

// Amount input for food quantities. Free text (NOT type="number") so kitchen
// fractions like "1/8" or "1 1/2" can be typed — a number input silently swallows
// the "/" and turns "1/8" into 18. Every read site resolves the text with
// parseAmount(), which accepts plain decimals and fractions alike.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (next: string) => void;
};

export function AmountField({ value, onValueChange, ...rest }: Props) {
  return (
    /* AMOUNT INPUT */
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      // No real amount needs more than this; keeps a pasted wall of text out of state.
      maxLength={12}
      value={value}
      onChange={(e) => onValueChange(sanitizeAmountInput(e.target.value))}
    />
  );
}
