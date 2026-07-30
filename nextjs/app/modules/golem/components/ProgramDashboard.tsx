"use client";

import { Fragment } from "react";
import { Program } from "../types/program";

const CHART_HEIGHT = 140;
const MIN_BAR_PCT = 15;

export default function ProgramDashboard({ program }: { program: Program }) {

  // Normalize bar heights against the largest week across the program, counting either actual
  // logged volume or — for weeks not yet performed — projected volume from their planned target sets.
  const maxVolume = Math.max(
    ...program.blocks.flatMap(b => b.weeks.map(w => Math.max(w.volume, w.estimated_volume))), 1
  );

  // Whether any week is drawn from projected (target-set) volume rather than logged volume.
  const hasProjectedWeek = program.blocks.some(b =>
    b.weeks.some(w => w.volume === 0 && w.estimated_volume > 0)
  );

  return (

    // CHART
    <>

      {/* BARS */}
      <div className="flex items-end gap-[3px]" style={{ height: CHART_HEIGHT }}>
        {program.blocks.map((block, blockIndex) => (
          <Fragment key={block.id}>

            {/* BLOCK SEPARATOR */}
            {blockIndex > 0 && <div className="w-3 shrink-0" />}

            {/* WEEK BARS */}
            {block.weeks.map((week) => {
              const color = block.color || '#6B7280';

              // A week with no logged volume falls back to its planned (target-set) volume so future
              // weeks render a meaningful, comparable bar instead of an empty stub.
              const hasActual = week.volume > 0;
              const isProjected = !hasActual && week.estimated_volume > 0;
              const displayVolume = hasActual ? week.volume : week.estimated_volume;

              const barPct = displayVolume === 0
                ? MIN_BAR_PCT
                : Math.max(MIN_BAR_PCT, (displayVolume / maxVolume) * 100);

              // Completed: translucent fill. Current (logged): solid fill. Projected (planned, not yet
              // performed): faint dashed fill. Future with no plan: border only.
              const backgroundColor = week.is_completed
                ? color + '33'
                : week.is_current && hasActual
                  ? color
                  : isProjected
                    ? color + '1A'
                    : 'transparent';

              return (

                // BAR
                <div
                  key={week.id}
                  className="flex-1 rounded-t-sm"
                  title={`${week.name || `Week ${week.week_number}`}: ${isProjected ? 'projected ' : ''}${Math.round(displayVolume).toLocaleString()} volume`}
                  style={{
                    height: `${barPct}%`,
                    backgroundColor,
                    borderWidth: '2px',
                    borderStyle: isProjected ? 'dashed' : 'solid',
                    borderBottomWidth: 0,
                    borderColor: color,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* LEGEND */}
      <div className="flex items-center gap-4">
        {program.blocks
          .filter(block => block.tag)
          .map((block) => (

            // LEGEND ITEM
            <div key={block.id} className="flex items-center gap-1.5">

              {/* COLOR SWATCH */}
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: block.color || '#6B7280' }}
              />

              {/* TAG NAME */}
              <span className="text-xs text-secondary">{block.tag}</span>
            </div>
          ))}

        {/* PROJECTED HINT */}
        {hasProjectedWeek && (

          // PROJECTED LEGEND ITEM
          <div className="flex items-center gap-1.5">

            {/* DASHED SWATCH */}
            <div
              className="w-3 h-3 rounded-sm"
              style={{ border: '1px dashed var(--color-secondary, #9CA3AF)' }}
            />

            {/* PROJECTED LABEL */}
            <span className="text-xs text-secondary">Projected</span>
          </div>
        )}
      </div>
    </>
  );
}
