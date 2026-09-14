"use client";

import { Skull } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, JOIN_CODE_PATTERN } from "@/app/modules/damnation/lib/constants";

// Public code-entry page for Damnation guests who didn't scan the QR code. Excluded from
// the sign-in gate in middleware.ts; no account needed.
export default function PlayCodeEntryPage() {
  const router = useRouter();

  // INPUT
  const [code, setCode] = useState("");

  // STATE
  const isValid = JOIN_CODE_PATTERN.test(code);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isValid) router.push(`/play/${code}`);
  }

  // Keep only characters that can appear in a code, upper-cased, so typing "o" or "0"
  // doesn't produce a code that can never match.
  function normalize(value: string): string {
    return value
      .toUpperCase()
      .split("")
      .filter((character) => JOIN_CODE_ALPHABET.includes(character))
      .join("")
      .slice(0, JOIN_CODE_LENGTH);
  }

  return (
    <div className="page">
      <div className="dmn-controller">

        {/* TITLE */}
        <h1 className="text-page-title">
          <Skull className="w-7 h-7" /> Damnation
        </h1>

        {/* CODE CARD */}
        <form className="card" onSubmit={submit}>
          <div className="card-content">

            {/* CODE LABEL */}
            <label className="text-h2" htmlFor="dmn-code">Game code</label>

            {/* CODE FIELD — autofocused: typing the code is the only thing to do on this page */}
            <input
              id="dmn-code"
              autoFocus
              className="input-field dmn-code"
              value={code}
              onChange={(event) => setCode(normalize(event.target.value))}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="go"
            />

            {/* JOIN BUTTON */}
            <Button type="submit" className="btn-green" disabled={!isValid}>
              Join
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
