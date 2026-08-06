'use client';

import { BackLink } from "@/components/BackLink";
import { ArrowLeft, CalendarDays } from 'lucide-react';
import DayArchetypeConfig from '../../../components/DayArchetypeConfig';
import '../../settings/settings.css';

// Day-archetype / slot configuration surface for the deterministic generation engine.
export default function DayArchetypeConfigPage() {

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER */}
        <div>

          {/* BACK — Day Archetypes now lives under Settings → Programming */}
          <BackLink fallback="/modules/golem/ui/settings" className="btn btn-link !pl-0">
            <ArrowLeft className="w-4 h-4" />
            <span>Settings</span>
          </BackLink>

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
