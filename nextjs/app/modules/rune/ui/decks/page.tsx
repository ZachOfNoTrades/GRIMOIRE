"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeckSummary } from "../../types/deck";

export default function DecksPage() {

  // DATA
  const [decks, setDecks] = useState<DeckSummary[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const response = await fetch("/modules/rune/api/decks");
      if (response.ok) {
        const data = await response.json();
        setDecks(data.decks || []);
      }
    } catch (error) {
      console.error("Error fetching decks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (

    // PAGE
    <div className="page">

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
            <h1 className="text-page-title">Decks</h1>
          </div>
        </div>

        {/* DECKS CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">
              <Layers className="w-5 h-5" />
              Decks
            </h2>
          </div>

          {/* DECK TABLE */}
          <div className="table-container">
            {isLoading ? (
              <div className="loading-container py-8">
                <div className="loading-spinner" />
              </div>
            ) : decks.length === 0 ? (
              <p className="text-page-subtitle text-center py-8">No decks found</p>
            ) : (
              <table className="table">
                <thead className="table-header">
                  <tr className="table-header-row">
                    <th className="table-header-cell">Deck</th>
                    <th className="table-header-cell !text-right w-0">Cards</th>
                    <th className="table-header-cell !text-right w-0">Due</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {decks.map((deck) => (
                    <tr
                      key={deck.id}
                      className="table-row-clickable"
                      onClick={() => router.push(`/modules/rune/ui/decks/${deck.id}`)}
                    >
                      <td className="table-cell">
                        <div>
                          <p>{deck.name}</p>
                          {deck.description && (
                            <p className="text-secondary">{deck.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="table-cell !text-right whitespace-nowrap">{deck.card_count}</td>
                      <td className="table-cell !text-right whitespace-nowrap">{deck.due_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
