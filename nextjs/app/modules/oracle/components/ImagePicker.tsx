"use client";

import { Search, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import type { OracleImage } from "../types/oracle";
import { api, campaignApi, errorMessage } from "../lib/client";
import { CAPTION_MAX } from "../lib/constants";

export interface ImageSource {
  key: "search" | "generate";
  label: string;
  available: boolean;
  note: string | null;
}

interface Candidate {
  id: string;
  title: string;
  thumbnail: string;
  credit: string;
}

interface ImagePickerProps {
  isOpen: boolean;
  campaignId: string;
  sources: ImageSource[];
  subject: string; // what the picture is for; pre-fills the description
  onAdded: (image: OracleImage) => void;
  onClose: () => void;
}

// GET A PICTURE — one description, two ways to turn it into a picture, side by side:
// search the web, or have an image model draw it. A file from this device can be uploaded too.
export default function ImagePicker({ isOpen, campaignId, sources, subject, onAdded, onClose }: ImagePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  // DATA
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [terms, setTerms] = useState<string | null>(null); // the words the last search actually used

  // INPUT
  const [description, setDescription] = useState("");

  // STATE
  const [busy, setBusy] = useState<"search" | "generate" | "import" | "upload" | null>(null);
  const trimmed = description.trim();
  const generate = sources.find((source) => source.key === "generate");

  useEffect(() => {
    if (isOpen) {
      setDescription(subject);
      setCandidates(null);
      setBusy(null);
    }
  }, [isOpen, subject]);

  function finish(image: OracleImage) {
    onAdded(image);
    onClose();
  }

  async function search() {
    if (!trimmed || busy) return;
    setBusy("search");
    try {
      const result = await api<{ terms: string; candidates: Candidate[] }>(`${campaignApi(campaignId)}/images/search`, "POST", { query: trimmed });
      setCandidates(result.candidates);
      setTerms(result.terms.toLowerCase() === trimmed.toLowerCase() ? null : result.terms);
    } catch (error) {
      toast.error(errorMessage(error, "The search failed"));
    } finally {
      setBusy(null);
    }
  }

  async function keep(candidate: Candidate) {
    if (busy) return;
    setBusy("import");
    try {
      finish(await api<OracleImage>(`${campaignApi(campaignId)}/images/import`, "POST", { source_id: candidate.id, caption: trimmed.slice(0, CAPTION_MAX) || candidate.title }));
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't keep that picture"));
      setBusy(null);
    }
  }

  async function generateImage() {
    if (!trimmed || busy || !generate?.available) return;
    setBusy("generate");
    try {
      finish(await api<OracleImage>(`${campaignApi(campaignId)}/images/generate`, "POST", { prompt: trimmed, caption: trimmed.slice(0, CAPTION_MAX) }));
    } catch (error) {
      toast.error(errorMessage(error, "The generator failed"));
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (busy) return;
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      if (trimmed) form.append("caption", trimmed.slice(0, CAPTION_MAX));
      const response = await fetch(`${campaignApi(campaignId)}/images`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "The upload failed");
      finish(data as OracleImage);
    } catch (error) {
      toast.error(errorMessage(error, "The upload failed"));
      setBusy(null);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Get a picture" wide disableClose={busy === "import" || busy === "generate" || busy === "upload"}>
      <div className="orc-picker">

        {/* DESCRIPTION FIELD — autofocused: the modal exists to take this one description, and
            typing is the next thing the DM does. Enter runs the search. */}
        <label className="orc-field">
          <span className="orc-field-label">What should it show?</span>
          <input
            id="orc-picker-description"
            className="input-field"
            autoFocus
            value={description}
            maxLength={120}
            placeholder="burned mill, old innkeeper, wolf…"
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search();
            }}
          />
        </label>

        {/* SOURCE BUTTONS — search and generate, side by side */}
        <div className="orc-picker-sources">

          {/* SEARCH */}
          <Button className="btn-blue" disabled={!trimmed || busy !== null} onClick={search}>
            <Search className="w-4 h-4" /> {busy === "search" ? "Searching…" : "Search the web"}
          </Button>

          {/* GENERATE */}
          <Button className="btn-off" disabled={!trimmed || busy !== null || !generate?.available} onClick={generateImage} title={generate?.note ?? undefined}>
            <Sparkles className="w-4 h-4" /> {busy === "generate" ? "Generating…" : "Generate"}
          </Button>

          {/* UPLOAD */}
          <Button className="btn-off" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" /> {busy === "upload" ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
        </div>

        {/* GENERATE NOTE */}
        {generate && !generate.available && <p className="orc-small text-secondary">Generate is off: {generate.note?.toLowerCase()}.</p>}

        {/* RESULTS LOADING PLACEHOLDER */}
        {busy === "search" && <p className="text-secondary">Searching…</p>}

        {/* EMPTY RESULTS PLACEHOLDER */}
        {candidates !== null && candidates.length === 0 && busy !== "search" && (
          <div className="empty-state">
            <p className="empty-state-title">Nothing found</p>
            <p className="empty-state-body">Try one or two plain words, like &quot;wolf&quot; or &quot;stone bridge&quot;.</p>
          </div>
        )}

        {/* SEARCH TERMS USED */}
        {terms && candidates !== null && busy !== "search" && <p className="orc-small text-secondary">Searched for: {terms}</p>}

        {/* RESULTS GRID */}
        {candidates !== null && candidates.length > 0 && (
          <div className="orc-picker-grid" aria-busy={busy === "import"}>
            {candidates.map((candidate) => (

              // RESULT
              <button key={candidate.id} type="button" className="orc-picker-result" disabled={busy !== null} onClick={() => keep(candidate)} title={candidate.title}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* A result whose picture no longer exists is taken out of the grid. */}
                <img
                  src={candidate.thumbnail}
                  alt={candidate.title}
                  loading="lazy"
                  onError={() => setCandidates((list) => (list ? list.filter((entry) => entry.id !== candidate.id) : list))}
                />
                <span className="orc-picker-credit">{candidate.credit || candidate.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
