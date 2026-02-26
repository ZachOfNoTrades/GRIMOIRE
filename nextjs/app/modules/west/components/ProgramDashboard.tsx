"use client";

import { Fragment } from "react";
import { Program } from "../types/program";

const CHART_HEIGHT = 140;
const MIN_BAR_PCT = 15;

export default function ProgramDashboard({ program }: { program: Program }) {

  // Normalize bar heights against max volume across all weeks
  const maxVolume = Math.max(
    ...program.blocks.flatMap(b => b.weeks.map(w => w.volume)), 1
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
              const barPct = week.volume === 0
                ? MIN_BAR_PCT
                : Math.max(MIN_BAR_PCT, (week.volume / maxVolume) * 100);

              // Current: solid fill. Completed: translucent fill. Future: border only.
              const backgroundColor = week.is_current
                ? color
                : week.is_completed
                  ? color + '33'
                  : 'transparent';

              return (

                // BAR
                <div
                  key={week.id}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${barPct}%`,
                    backgroundColor,
                    borderWidth: '2px',
                    borderStyle: 'solid',
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
      </div>
    </>
  );
}
