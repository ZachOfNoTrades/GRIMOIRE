"use client";

import { useId, type ComponentType } from "react";
import { ChevronRight } from "lucide-react";

// Shared "grouped list" primitives for module settings/preferences pages.
// Reference implementation: Forage's Settings tab. Pairs with the
// `.settings-*` design system classes in globals.css — see the SETTINGS
// LIST section there for the CSS, and `components/settings/README.md`
// for the design guide.

export interface SettingsRowItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

// SETTINGS GROUP — a rounded card of navigational rows (icon + label + chevron).
export function SettingsGroup({ rows }: { rows: SettingsRowItem[] }) {
  return (
    <div className="settings-group">
      {rows.map((row, i) => {
        const Icon = row.icon;
        return (
          <button
            key={row.label}
            type="button"
            className="settings-row"
            data-first={i === 0 ? "true" : undefined}
            data-last={i === rows.length - 1 ? "true" : undefined}
            onClick={row.onClick}
          >
            <Icon className="settings-row-icon w-5 h-5" />
            <span className="settings-row-label">{row.label}</span>
            <ChevronRight className="settings-row-chev w-5 h-5" />
          </button>
        );
      })}
    </div>
  );
}

// SETTINGS TOGGLE ROW — a labeled switch row, meant to sit inside a .settings-group.
//
// Only the switch is pressable. The row used to be one big button, so a click anywhere in it —
// reading the hint, selecting the label — flipped the setting; the text is there to be read, not
// operated. The switch takes its name from the label rather than repeating it.
export function SettingsToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = useId();
  return (
    <div className="settings-toggle-row" aria-disabled={disabled || undefined}>
      <span className="settings-toggle-body">
        <span className="settings-toggle-label" id={labelId}>{label}</span>
        {hint && <span className="settings-toggle-hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        className="settings-switch"
        onClick={() => !disabled && onChange(!checked)}
      />
    </div>
  );
}

// SETTINGS TIME ROW — a labeled native time input row, meant to sit inside a .settings-group.
export function SettingsTimeRow({
  label,
  value,
  disabled,
  divider = true,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  divider?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="settings-time-row" style={divider ? { borderTop: "1px solid var(--card-border)" } : undefined}>
      <span className="settings-time-label">{label}</span>
      <input
        type="time"
        className="settings-time-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// SETTINGS CONTROL ROW — a labeled row whose trailing slot holds any control
// (a segmented toggle, a select). Meant to sit inside a .settings-group, and the
// generic sibling of SettingsToggleRow / SettingsTimeRow. Stacks the control
// under the label on narrow phones (see the CSS).
export function SettingsControlRow({
  label,
  divider = false,
  children,
}: {
  label: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-control-row" style={divider ? { borderTop: "1px solid var(--card-border)" } : undefined}>

      {/* LABEL */}
      <span className="settings-control-label">{label}</span>

      {/* CONTROL */}
      <span className="settings-control-slot">{children}</span>
    </div>
  );
}

export interface SettingsRadioOption<T extends string> {
  value: T;
  label: string;
}

// SETTINGS RADIO GROUP — a rounded card of single-select radio rows.
export function SettingsRadioGroup<T extends string>({
  options,
  value,
  disabled,
  onChange,
}: {
  options: SettingsRadioOption<T>[];
  value: T;
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div className="settings-group">
      {options.map((o, i) => {
        const checked = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            className="unit-option"
            data-first={i === 0 ? "true" : undefined}
            onClick={() => !disabled && onChange(o.value)}
          >
            <span className="unit-option-label">{o.label}</span>
            <span className="unit-option-radio" />
          </button>
        );
      })}
    </div>
  );
}
