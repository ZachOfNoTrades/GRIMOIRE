# Settings design guide

Shared grouped-list primitives for module settings/preferences pages, extracted
from Forage's Settings tab (the reference implementation). Live in
`SettingsList.tsx`; the backing CSS is the `SETTINGS LIST` section near the end
of `app/globals.css`.

## When to use this

Use these components for a page whose job is "let the user view/change a set
of preferences" — navigational sub-pages, on/off switches, a time picker, a
single-select choice. Forage's Settings tab, Rune's Settings page, and Quest's
digest controls all use it.

Don't use it for master/detail explorers (deck lists, exercise pickers) — that
job belongs to the separate `.erow-*` / `ExpandableRowList` pattern already in
`globals.css`, which is a different visual language (monospace terminal-style
section labels) for a different interaction (browse + drill into a detail
pane). The two are intentionally not merged.

## Components

- `SettingsGroup` — a rounded card of navigational rows (icon, label, chevron) that push to a sub-page.
- `SettingsToggleRow` — a labeled on/off switch row.
- `SettingsTimeRow` — a labeled native `<input type="time">` row.
- `SettingsRadioGroup` — a rounded card of single-select radio rows (string-valued).
- `SettingsBackLink` — the chevron + label "back to X" link used above a sub-page's title.

All of the above are meant to sit inside a `.settings-group` card (except
`SettingsGroup`, which renders its own). Use `.settings-section-title` for a
section heading above a group, `.settings-title` on the page's `<h1>`, and
`.settings-group-note` for helper copy below a group.

## Rules this encodes (from the repo's house style)

- No hardcoded colors/Tailwind color utilities in JSX — everything here reads
  design tokens (`--color-primary`, `--color-secondary`, `--card-bg`,
  `--card-border`) so it tracks light/dark automatically.
- Buttons outside these row components still use `<Button>` from
  `@/components/ui/button` with a `.btn-*` variant class (`btn-blue` for the
  primary action, `btn-off` for a neutral/secondary one) — never a raw
  `<button>` with ad hoc Tailwind classes.

## Known scope gaps (not covered by this pass)

- **Golem's Settings page** (`app/modules/golem/ui/settings/`) uses its own
  `.gs-*` classes via `components/GolemMenu.tsx`, which is also shared by
  golem's home page menu and `engine/config-preview`. It already reads real
  design tokens, so it isn't a hardcoded-color violation — it's a deliberate
  parallel "terminal console" visual variant. Migrating it onto
  `SettingsList` would restyle golem's primary home-screen navigation, not
  just its settings page, so it was left alone here as a separate, larger
  follow-up rather than folded into this pass.
- **Quest's Settings page** (`app/modules/quest/ui/settings/page.tsx`) is a
  1400+ line stack of config cards (reward formulas, ledger, danger-zone
  modals) for the coin/reward economy. Only the Daily Digest card and the two
  `btn-secondary` (undefined-class) buttons were migrated/fixed in this pass;
  the remaining raw `border-gray-600`/hardcoded-color form inputs and confirm
  modals were left as-is to avoid touching economy-critical logic in one
  unattended pass.
- **Global admin console** (`app/settings/ui/home`, `app/settings/ui/user/[id]`)
  is a CRUD table (users, API keys), not a preferences list — grouped rows
  don't fit that content, so it wasn't touched.
