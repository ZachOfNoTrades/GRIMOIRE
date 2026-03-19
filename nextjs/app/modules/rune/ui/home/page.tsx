"use client";

import Link from "next/link";
import { BookOpen, Layers, Zap } from "lucide-react";

export default function RuneHomePage() {

  return (

    // PAGE
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE HEADER */}
        <div className="mb-8">

          {/* PAGE TITLE */}
          <h1 className="text-page-title">
            <BookOpen className="w-8 h-8" />
            Flash Cards
          </h1>
        </div>

        {/* NAVIGATION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* DECKS CARD */}
          <Link href="/modules/rune/ui/decks">
            <div className="module-card">
              <h2 className="text-card-title">
                <Layers className="w-5 h-5" />
                Decks
              </h2>
            </div>
          </Link>

          {/* GENERATE CARD */}
          <Link href="/modules/rune/ui/decks/generate">
            <div className="module-card">
              <h2 className="text-card-title">
                <Zap className="w-5 h-5" />
                Generate Cards
              </h2>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
