'use client';

import { useRouter } from 'next/navigation';
import { useGoBack } from "@/lib/useGoBack";
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DayArchetypeConfig from '../../../components/DayArchetypeConfig';
import '../../settings/settings.css';

// Day-archetype / slot configuration surface for the deterministic generation engine.
export default function DayArchetypeConfigPage() {
  const router = useRouter();
  const goBack = useGoBack();

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER */}
        <div>

          {/* BACK — Day Archetypes now lives under Settings → Programming */}
          <Button onClick={() => goBack('/modules/golem/ui/settings')} className="btn-link !pl-0">
            <ArrowLeft className="w-4 h-4" />
            <span>Settings</span>
          </Button>

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
