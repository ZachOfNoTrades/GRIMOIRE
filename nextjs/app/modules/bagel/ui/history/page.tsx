"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { BagelGame, BagelGameHistoryItem } from "../../types/bagel";
import PaginatedTable from "../../components/PaginatedTable";
import GuessHistory from "../../components/GuessHistory";

// "2026-03-03 3:45 PM"
function formatDateTimeShort(date: string): string {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${yyyy}-${mm}-${dd} ${time}`;
}

// Status -> badge class + label for the history table.
const STATUS_BADGE: Record<BagelGameHistoryItem["status"], { className: string; label: string }> = {
  active: { className: "badge-blue", label: "Active" },
  won: { className: "badge-green", label: "Won" },
  lost: { className: "badge-red", label: "Lost" },
  skipped: { className: "badge-gray", label: "Skipped" },
};

export default function BagelHistoryPage() {
  const router = useRouter();

  // DATA — the fully-loaded game (with its per-guess history) shown in the modal.
  const [selectedGame, setSelectedGame] = useState<BagelGame | null>(null);

  // STATE — modal visibility + per-game detail fetch flags. `selectedRow` holds the
  // list row so the modal header can render immediately while the guesses load.
  const [selectedRow, setSelectedRow] = useState<BagelGameHistoryItem | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Opens the details modal for a game and loads its guess history. The list row
  // already carries the summary fields; only the per-guess history is fetched here.
  async function openGame(row: BagelGameHistoryItem) {
    setSelectedRow(row);
    setSelectedGame(null);
    setDetailError(null);
    setIsDetailLoading(true);
    try {
      const res = await fetch(`/modules/bagel/api/games/${row.id}`);
      if (!res.ok) throw new Error("Failed to load game");
      const game: BagelGame = await res.json();
      setSelectedGame(game);
    } catch (error) {
      console.error("Error loading bagel game detail:", error);
      setDetailError("Couldn't load this game's guesses.");
    } finally {
      setIsDetailLoading(false);
    }
  }

  // Closes the modal and clears the loaded detail.
  function closeGame() {
    setSelectedRow(null);
    setSelectedGame(null);
    setDetailError(null);
  }

  return (

    // PAGE
    <div className="page">
      <div className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/bagel/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <h1 className="text-page-title">
            <History className="w-6 h-6" /> Bagel History
          </h1>
        </div>

        {/* HISTORY CARD */}
        <div className="card">

          {/* PAGINATED GAMES TABLE */}
          <PaginatedTable<BagelGameHistoryItem>
            fetchUrl={(page, pageSize) => `/modules/bagel/api/games?page=${page}&pageSize=${pageSize}`}
            dataKey="games"
            columns={[
              { header: "Date" },
              { header: "Digits" },
              { header: "Guesses" },
              { header: "Result" },
              { header: "Secret" },
            ]}
            renderRow={(game) => {
              const badge = STATUS_BADGE[game.status];
              return (

                // TABLE ROW — tap to view this game's guesses.
                <tr key={game.id} className="table-row-clickable" onClick={() => openGame(game)}>
                  <td className="table-cell whitespace-nowrap">{formatDateTimeShort(game.ts_created)}</td>
                  <td className="table-cell">{game.num_digits}</td>
                  <td className="table-cell">{game.num_guesses} / {game.max_guesses}</td>
                  <td className="table-cell"><span className={badge.className}>{badge.label}</span></td>
                  <td className="table-cell font-mono">{game.secret ?? "—"}</td>
                </tr>
              );
            }}
            emptyMessage="No games played yet"
          />
        </div>

        {/* GAME DETAILS MODAL */}
        <Modal
          isOpen={selectedRow !== null}
          onClose={closeGame}
          title={selectedRow ? formatDateTimeShort(selectedRow.ts_created) : ""}
        >
          {selectedRow && (

            // MODAL CONTENT
            <div className="flex flex-col gap-4">

              {/* GAME SUMMARY */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-secondary">

                {/* RESULT */}
                <span className={STATUS_BADGE[selectedRow.status].className}>
                  {STATUS_BADGE[selectedRow.status].label}
                </span>

                {/* DIGITS */}
                <span>{selectedRow.num_digits} digits</span>

                {/* GUESS COUNT */}
                <span>{selectedRow.num_guesses} / {selectedRow.max_guesses} guesses</span>

                {/* SECRET */}
                {selectedRow.secret && (
                  <span>Secret <span className="font-mono">{selectedRow.secret}</span></span>
                )}
              </div>

              {/* GUESS HISTORY */}
              {isDetailLoading ? (

                // LOADING PLACEHOLDER
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : detailError ? (

                // ERROR
                <div className="alert-red alert-text">{detailError}</div>
              ) : selectedGame && selectedGame.guesses.length > 0 ? (

                // GUESSES
                <GuessHistory guesses={selectedGame.guesses} />
              ) : (

                // NO GUESSES
                <div className="text-secondary">No guesses were made in this game.</div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
