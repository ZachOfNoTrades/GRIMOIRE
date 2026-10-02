"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DISPLAY_CODE_LENGTH, DISPLAY_CODE_PATTERN } from "@/app/modules/oracle/lib/constants";

export default function JoinClient() {
  const router = useRouter();

  // INPUT
  const [code, setCode] = useState("");

  // STATE
  const [error, setError] = useState<string | null>(null);

  function open() {
    const value = code.trim().toUpperCase();
    if (!DISPLAY_CODE_PATTERN.test(value)) {
      setError(`The code is ${DISPLAY_CODE_LENGTH} letters, shown on the DM's screen.`);
      return;
    }
    router.push(`/oracle/${value}`);
  }

  return (
    // JOIN PAGE
    <div className="orc-display">
      <div className="orc-display-join">

        {/* TITLE */}
        <h1 className="text-page-title">Player display</h1>

        {/* ERROR */}
        {error && <div className="alert alert-red"><p className="alert-text">{error}</p></div>}

        {/* CODE FIELD — autofocused: this page exists to take one code, and typing it is the
            only thing to do here. */}
        <input
          id="orc-display-code"
          className="input-field"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          maxLength={DISPLAY_CODE_LENGTH}
          placeholder="CODE"
          aria-label="Display code"
          onChange={(event) => {
            setCode(event.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase());
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              open();
            }
          }}
        />

        {/* OPEN BUTTON */}
        <Button className="btn-blue" onClick={open}>Open display</Button>
      </div>
    </div>
  );
}
