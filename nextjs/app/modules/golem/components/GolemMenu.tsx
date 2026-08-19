'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import '../ui/settings/settings.css';

// A single navigable menu row (icon tile + label + optional hint + chevron).
export interface GolemMenuItem {
  icon: LucideIcon;
  label: string;
  hint?: string;
  href?: string;            // route to push on click
  onClick?: () => void;     // custom handler (takes precedence over href)
}

// A labelled group of rows rendered as one hairline-divided card.
export interface GolemMenuSection {
  title: string;
  items: GolemMenuItem[];
}

// Shared terminal-console grouped menu used by the Settings page and the home
// dashboard. Rows stagger in on mount for a single orchestrated reveal.
export default function GolemMenu({
  sections,
  animate = true,
  startDelayMs = 0,
}: {
  sections: GolemMenuSection[];
  animate?: boolean;
  startDelayMs?: number;
}) {
  // Running index so the stagger delay is continuous across every section.
  let rowIndex = 0;

  return (
    /* MENU */
    <div>
      {sections.map((section) => (

        /* SECTION */
        <div key={section.title}>

          {/* SECTION LABEL */}
          <h2 className="gs-section">{section.title}</h2>

          {/* SECTION GROUP */}
          <div className="gs-group">
            {section.items.map((item) => {
              const Icon = item.icon;
              const delay = startDelayMs + rowIndex * 45;
              rowIndex += 1;

              // A row that only navigates renders as a real <Link>, so middle-click /
              // cmd-click open it in a new tab. Rows with their own handler stay
              // buttons — there is no URL for the browser to open.
              const rowClass = `gs-row ${animate ? 'gs-animate' : ''}`;
              const rowStyle = animate ? { animationDelay: `${delay}ms` } : undefined;
              const rowBody = (
                <>

                  {/* ICON TILE */}
                  <span className="gs-icon">
                    <Icon className="w-5 h-5" />
                  </span>

                  {/* ROW BODY */}
                  <span className="gs-row-body">
                    <span className="gs-row-label">{item.label}</span>
                    {item.hint && <span className="gs-row-hint">{item.hint}</span>}
                  </span>

                  {/* CHEVRON */}
                  <ChevronRight className="gs-row-chev w-5 h-5" />
                </>
              );

              return !item.onClick && item.href ? (

                /* MENU ROW — pure navigation */
                <Link key={item.label} href={item.href} className={rowClass} style={rowStyle}>
                  {rowBody}
                </Link>
              ) : (

                /* MENU ROW — runs a handler */
                <button
                  key={item.label}
                  type="button"
                  className={rowClass}
                  style={rowStyle}
                  onClick={item.onClick}
                >
                  {rowBody}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
