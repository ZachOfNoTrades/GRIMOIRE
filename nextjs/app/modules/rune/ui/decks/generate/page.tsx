"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";

export default function GenerateCardsPage() {

  // INPUT
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  // STATE
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ cardsGenerated: number; deckId: string; notionPageTitle: string } | null>(null);

  const router = useRouter();

  // GENERATE HANDLER
  const handleGenerate = async () => {
    if (!deckName.trim()) {
      toast.error("Deck name is required");
      return;
    }
    if (!notionUrl.trim()) {
      toast.error("Notion URL is required");
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const response = await fetch("/modules/rune/api/decks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckName: deckName.trim(),
          deckDescription: deckDescription.trim() || null,
          notionUrl: notionUrl.trim(),
          customPrompt: customPrompt.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate cards");
        return;
      }

      const data = await response.json();
      setResult(data);
      toast.success(`Generated ${data.cardsGenerated} cards`);
    } catch (error) {
      console.error("Error generating cards:", error);
      toast.error("Failed to generate cards");
    } finally {
      setIsGenerating(false);
    }
  };

  return (

    // PAGE
    <div className="page">

      <Toaster />

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/rune/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">Generate Cards</h1>
          </div>
        </div>

        {/* GENERATE CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">
              <Zap className="w-5 h-5" />
              Generate from Notion
            </h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* DECK NAME INPUT */}
            <div>
              <label className="text-secondary">Deck Name</label>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                className="input-field"
                placeholder="e.g. Anatomy & Physiology"
                disabled={isGenerating}
                autoFocus
              />
            </div>

            {/* DECK DESCRIPTION INPUT */}
            <div>
              <label className="text-secondary">Deck Description (optional)</label>
              <input
                type="text"
                value={deckDescription}
                onChange={(e) => setDeckDescription(e.target.value)}
                className="input-field"
                placeholder="e.g. Major muscles, bones, and body systems"
                disabled={isGenerating}
              />
            </div>

            {/* NOTION URL INPUT */}
            <div>
              <label className="text-secondary">Notion Page URL</label>
              <input
                type="text"
                value={notionUrl}
                onChange={(e) => setNotionUrl(e.target.value)}
                className="input-field"
                placeholder="https://notion.so/..."
                disabled={isGenerating}
              />
            </div>

            {/* CUSTOM PROMPT INPUT */}
            <div>
              <label className="text-secondary">Custom Instructions (optional)</label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="input-field min-h-[80px] resize-y"
                placeholder="e.g. Focus on vocabulary, skip the examples..."
                rows={3}
                disabled={isGenerating}
              />
            </div>

            {/* GENERATE BUTTON */}
            <div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !deckName.trim() || !notionUrl.trim()}
                className="btn-blue"
              >
                <Zap className="w-4 h-4" />
                {isGenerating ? "Generating..." : "Generate Cards"}
              </Button>
            </div>

            {/* RESULT */}
            {result && (
              <div className="alert-green">
                <p>
                  Created deck with <strong>{result.cardsGenerated}</strong> cards
                  {result.notionPageTitle && (
                    <> from <strong>{result.notionPageTitle}</strong></>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
