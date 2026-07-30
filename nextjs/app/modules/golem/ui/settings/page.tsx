'use client';

import { useRouter } from 'next/navigation';
import { useGoBack } from "@/lib/useGoBack";
import {
  ArrowLeft,
  Settings,
  Dumbbell,
  MapPin,
  LayoutTemplate,
  CalendarDays,
  History,
  BarChart3,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import GolemMenu, { type GolemMenuSection } from '../../components/GolemMenu';
import './settings.css';

// Golem settings hub — every configuration / library / insight surface, grouped
// into a categorized terminal-console menu (mirrors the forage & quest pattern).
export default function GolemSettingsPage() {
  const router = useRouter();
  const goBack = useGoBack();

  // MENU SECTIONS
  const sections: GolemMenuSection[] = [
    {
      title: 'Library',
      items: [
        { icon: Dumbbell, label: 'Exercise Library', hint: 'Browse, enable, and edit movements', href: '/modules/golem/ui/exercises' },
        { icon: MapPin, label: 'Locations', hint: 'Gyms and available equipment', href: '/modules/golem/ui/locations' },
      ],
    },
    {
      title: 'Programming',
      items: [
        { icon: LayoutTemplate, label: 'Program Templates', hint: 'Reusable program blueprints', href: '/modules/golem/ui/templates' },
        { icon: CalendarDays, label: 'Day Archetypes', hint: 'Workout days the engine generates from', href: '/modules/golem/ui/archetypes' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { icon: History, label: 'Workout History', hint: 'Past sessions and imports', href: '/modules/golem/ui/history' },
        { icon: BarChart3, label: 'Weekly Volume', hint: 'Sets per muscle vs. landmarks', href: '/modules/golem/ui/volume' },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: User, label: 'User Profile', hint: 'Training preferences and limits', href: '/modules/golem/ui/profile' },
      ],
    },
  ];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <Button onClick={() => goBack('/modules/golem/ui/home')} className="btn-link !pl-0">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Button>

        {/* HEADER */}
        <div className="gs-header">
          <h1 className="text-page-title gs-title">
            <Settings className="w-6 h-6" />
            Settings
          </h1>
        </div>

        {/* SUBTITLE */}
        <p className="gs-subtitle">Libraries, programming, and account configuration.</p>

        {/* CATEGORIZED MENU */}
        <GolemMenu sections={sections} />
      </div>
    </div>
  );
}
