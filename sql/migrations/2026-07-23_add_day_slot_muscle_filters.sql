-- 2026-07-23  GRIMOIRE-GOLEM
-- Per-slot movement-pattern constraints for the deterministic generator, expressed as muscle filters
-- (no new exercise columns; reuses the engine's existing name-based muscle comparison).
--   required_muscles : comma-separated muscle NAMES the candidate must ALSO recruit (all of them).
--                      e.g. a Shoulders slot with 'Triceps' selects overhead presses, not face pulls/raises.
--   excluded_muscles : comma-separated muscle NAMES the candidate must NOT recruit (any of them).
--                      e.g. a Hamstrings slot excluding 'Lower Back' selects leg-curl patterns, not hinges.
-- NULL/blank = no constraint. Wired into SlotSpec.requiredMuscles / contraindicatedMuscles.
IF COL_LENGTH('dbo.day_slots', 'required_muscles') IS NULL
  ALTER TABLE dbo.day_slots ADD required_muscles NVARCHAR(400) NULL;
IF COL_LENGTH('dbo.day_slots', 'excluded_muscles') IS NULL
  ALTER TABLE dbo.day_slots ADD excluded_muscles NVARCHAR(400) NULL;
