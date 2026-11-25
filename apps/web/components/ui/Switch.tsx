"use client";

export function Switch({
  checked, onChange, label, description, disabled, size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shift = size === "sm" ? "translate-x-4" : "translate-x-5";
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex ${track} shrink-0 items-center rounded-full p-0.5 transition disabled:opacity-50 ${checked ? "bg-brand" : "bg-border-strong"}`}
    >
      <span className={`${knob} rounded-full bg-white shadow-sm transition ${checked ? shift : "translate-x-0"}`} />
    </button>
  );
  // A label alone is used as the accessible name only (table rows);
  // with a description it renders as a visible settings row.
  if (!description) return button;
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        {label && <span className="block text-sm font-medium text-ink-primary">{label}</span>}
        <span className="mt-0.5 block text-sm text-ink-secondary">{description}</span>
      </span>
      {button}
    </label>
  );
}
