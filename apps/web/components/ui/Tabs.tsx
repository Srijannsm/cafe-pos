type Tab<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type TabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** "segmented" = pill switcher (admin pages); "underline" = classic tabs. */
  variant?: "segmented" | "underline";
};

export function Tabs<T extends string>({ tabs, value, onChange, className = "", variant = "segmented" }: TabsProps<T>) {
  if (variant === "underline") {
    return (
      <div className={`no-scrollbar flex gap-1 overflow-x-auto border-b border-border-subtle ${className}`} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            onClick={() => onChange(tab.value)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              value === tab.value
                ? "border-brand text-brand-strong"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {tab.label}
            {tab.count != null && <span className="ml-1.5 text-ink-faint">{tab.count}</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div
      className={`no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-sunken p-0.5 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition ${
            value === tab.value
              ? "bg-surface-raised text-ink-primary shadow-sm"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {tab.label}
          {tab.count != null && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${value === tab.value ? "bg-brand-tint text-brand-strong" : "bg-surface-raised text-ink-faint"}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
