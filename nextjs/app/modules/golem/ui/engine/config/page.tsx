'use client';

import { ArrowLeft, CalendarDays } from 'lucide-react';
import DayArchetypeConfig from '../../../components/DayArchetypeConfig';
import '../../settings/settings.css';
import Breadcrumbs from "@/components/Breadcrumbs";

// Day-archetype / slot configuration surface for the deterministic generation engine.
export default function DayArchetypeConfigPage() {

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER */}
        <div>

          {/* BREADCRUMBS */}
          <Breadcrumbs />

          {/* TITLE */}
          <h1 className="text-page-title gs-title">
            <CalendarDays className="w-6 h-6" />
            Day Archetypes
          </h1>

          {/* SUBTITLE */}
          <p className="gs-subtitle">Define reusable workout days the generation engine builds sessions from.</p>
        </div>

        {/* CONFIG SURFACE */}
        <DayArchetypeConfig />
      </div>
    </div>
  );
}
