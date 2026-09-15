"use client";

import { useState, useEffect, useMemo } from "react";
import { BackLink } from "@/components/BackLink";
import { useRouter } from "next/navigation";
import { useRowNav } from "@/lib/useRowNav";
import { ArrowLeft, Boxes, Plus } from "lucide-react";
import { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { SearchField, SMART_MATCH_HINT } from "@/components/SearchField";
import { CollectionSummary } from "../../types/collection";
import { formatRelativePast } from "@/lib/format";
import { makeSearchMatcher } from "@/lib/searchMatch";
import ManageCollectionModal from "./ManageCollectionModal";

export default function CollectionsPage() {

  // DATA
  const [collections, setCollections] = useState<CollectionSummary[]>([]);

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Search narrows the list; the server already returns collections alphabetically.
  const visibleCollections = useMemo(() => {
    const query = searchQuery.trim();
    // Same shared matcher the deck list and card list use — see lib/searchMatch.ts.
    const matchesQuery = makeSearchMatcher(query);
    if (!query) return collections;

    return collections.filter((collection) =>
      matchesQuery(`${collection.name} ${collection.description ?? ""}`)
    );
  }, [collections, searchQuery]);

  const router = useRouter();

  const rowNav = useRowNav();

  // LOAD DATA
  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const response = await fetch("/modules/rune/api/collections");
      if (response.ok) {
        const data = await response.json();
        setCollections(data.collections || []);
      }
    } catch (error) {
      console.error("Error fetching collections:", error);
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
          <BackLink
            fallback="/modules/rune/ui/home"
            className="btn btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">Collections</h1>
            <p className="text-secondary">Group decks and study them in one session.</p>
          </div>
        </div>

        {/* COLLECTIONS CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header flex items-center justify-between">
            <h2 className="text-card-title">
              <Boxes className="w-5 h-5" />
              Collections
            </h2>

            {/* ADD BUTTON */}
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-blue"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </Button>
          </div>

          {/* CONTROLS — client-side search over the collection list */}
          {!isLoading && collections.length > 0 && (
            <div className="erow-search-row">

              {/* SEARCH BAR */}
              <SearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search collections…"
                ariaLabel="Search collections"
                matchHint={SMART_MATCH_HINT}
              />
            </div>
          )}

          {/* COLLECTION TABLE */}
          <div className="table-container">
            <table className="table">
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell">Collection</th>
                  <th className="table-header-cell !text-right w-0">Decks</th>
                  <th className="table-header-cell !text-right w-0">Cards</th>
                  <th className="table-header-cell !text-right w-0">Due</th>
                  <th className="table-header-cell !text-right w-0">Last Reviewed</th>
                </tr>
              </thead>
              <tbody className="table-body">

                {/* LOADING PLACEHOLDER */}
                {isLoading && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER — no collections at all */}
                {!isLoading && collections.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>No collections found</td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER — collections exist but none match the search */}
                {!isLoading && collections.length > 0 && visibleCollections.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>No collections match your search</td>
                  </tr>
                )}

                {/* COLLECTION ROWS */}
                {!isLoading && visibleCollections.map((collection) => (
                  <tr
                    key={collection.id}
                    className="table-row-clickable"
                    {...rowNav(`/modules/rune/ui/collections/${collection.id}`)}
                  >
                    <td className="table-cell">
                      <div>
                        <p>{collection.name}</p>
                        {collection.description && (
                          <p className="text-secondary">{collection.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="table-cell !text-right whitespace-nowrap">{collection.deck_count}</td>
                    <td className="table-cell !text-right whitespace-nowrap">{collection.card_count}</td>
                    <td className="table-cell !text-right whitespace-nowrap">{collection.due_count}</td>
                    <td className="table-cell !text-right whitespace-nowrap text-secondary">{formatRelativePast(collection.last_reviewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ADD COLLECTION MODAL */}
      <ManageCollectionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={(collection) => {
          if (collection) router.push(`/modules/rune/ui/collections/${collection.id}`);
        }}
      />

      {/* TOASTER */}
      <Toaster />
    </div>
  );
}
