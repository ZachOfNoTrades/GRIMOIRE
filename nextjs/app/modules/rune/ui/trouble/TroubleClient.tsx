"use client";

import { useEffect, useState } from "react";
import { useRowNav } from "@/lib/useRowNav";
import { AlertTriangle } from "lucide-react";
import Breadcrumbs from "@/components/Breadcrumbs";
import CardContent from "../../components/CardContent";
import { TroubleCard, TROUBLE_RECENT_WINDOW, isEaseTrouble, isLapseTrouble, isRecentTrouble } from "../../types/trouble";

// Show a value in a red badge when it put the card on the list
function TroubleValue({ value, isTrouble }: { value: string; isTrouble: boolean }) {
  return isTrouble ? <span className="badge-red">{value}</span> : <span>{value}</span>;
}

interface TroubleClientProps {
  initialCards: TroubleCard[] | null; // Null when the server did not load the list
}

export default function TroubleClient({ initialCards }: TroubleClientProps) {

  // DATA
  const [cards, setCards] = useState<TroubleCard[]>(initialCards ?? []);

  // STATE
  const [isLoading, setIsLoading] = useState(initialCards === null);

  const rowNav = useRowNav();

  // Fetch the list only when the server did not load it
  useEffect(() => {
    if (initialCards !== null) return;
    const fetchCards = async () => {
      try {
        const response = await fetch("/modules/rune/api/trouble");
        if (response.ok) {
          const data = await response.json();
          setCards(Array.isArray(data.cards) ? data.cards : []);
        }
      } catch (error) {
        console.error("Error fetching trouble cards:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCards();
  }, [initialCards]);

  return (

    // PAGE
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BREADCRUMBS */}
          <Breadcrumbs />

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">Trouble Cards</h1>
            <p className="text-secondary">Cards you keep missing, across every deck.</p>
          </div>
        </div>

        {/* TROUBLE CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">
              <AlertTriangle className="w-5 h-5" />
              Trouble Cards
            </h2>
          </div>

          {/* TROUBLE TABLE */}
          <div className="table-container">
            <table className="table">
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell">Card</th>
                  <th className="table-header-cell !text-right w-0 trouble-stat-col">Missed</th>
                  <th className="table-header-cell !text-right w-0 trouble-stat-col">Lapses</th>
                  <th className="table-header-cell !text-right w-0 trouble-stat-col">Ease</th>
                </tr>
              </thead>
              <tbody className="table-body">

                {/* LOADING PLACEHOLDER */}
                {isLoading && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={4}>
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER */}
                {!isLoading && cards.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={4}>No trouble cards</td>
                  </tr>
                )}

                {/* TROUBLE CARD ROWS */}
                {!isLoading && cards.map((card) => {
                  const missed = `${card.recent_miss_count} of ${Math.min(card.review_count, TROUBLE_RECENT_WINDOW)}`;
                  const ease = card.ease_factor !== null ? card.ease_factor.toFixed(2) : "-";
                  return (
                    <tr
                      key={card.id}
                      className="table-row-clickable"
                      {...rowNav(`/modules/rune/ui/decks/${card.deck_id}`)}
                    >

                      {/* FRONT AND DECK */}
                      <td className="table-cell rune-card-cell">
                        <CardContent text={card.front} />
                        <p className="text-secondary mt-1">{card.deck_name}</p>

                        {/* PHONE STATS — the three columns, folded under the front on narrow screens */}
                        <div className="trouble-phone-stats">
                          <div>
                            <p className="stat-label">Missed</p>
                            <TroubleValue value={missed} isTrouble={isRecentTrouble(card)} />
                          </div>
                          <div>
                            <p className="stat-label">Lapses</p>
                            <TroubleValue value={String(card.lapse_count)} isTrouble={isLapseTrouble(card)} />
                          </div>
                          <div>
                            <p className="stat-label">Ease</p>
                            <TroubleValue value={ease} isTrouble={isEaseTrouble(card)} />
                          </div>
                        </div>
                      </td>

                      {/* MISSED — Again or Hard among the latest ratings */}
                      <td className="table-cell !text-right whitespace-nowrap trouble-stat-col">
                        <TroubleValue value={missed} isTrouble={isRecentTrouble(card)} />
                      </td>

                      {/* LAPSES */}
                      <td className="table-cell !text-right whitespace-nowrap trouble-stat-col">
                        <TroubleValue value={String(card.lapse_count)} isTrouble={isLapseTrouble(card)} />
                      </td>

                      {/* EASE */}
                      <td className="table-cell !text-right whitespace-nowrap trouble-stat-col">
                        <TroubleValue value={ease} isTrouble={isEaseTrouble(card)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
