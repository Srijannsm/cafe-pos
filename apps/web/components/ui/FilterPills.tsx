type FilterPillsProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Optional render function for custom labels, e.g. adding counts. */
  renderLabel?: (option: T) => React.ReactNode;
  /** Size variant — `sm` drops body padding for tighter fit (reports). */
  size?: "sm" | "md";
};

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
  size = "md",
}: FilterPillsProps<T>) {
  const padding = size === "sm" ? "px-3 py-2" : "px-4 py-2";

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-pill ${padding} font-body text-sm font-semibold transition ${
            value === option
              ? "bg-brand text-on-brand"
              : "border border-border-subtle bg-surface-raised text-ink-secondary hover:bg-surface-sunken"
          }`}
        >
          {renderLabel ? renderLabel(option) : option}
        </button>
      ))}
    </div>
  );
}
