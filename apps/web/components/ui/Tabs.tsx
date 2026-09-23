type Tab<T extends string> = {
  value: T;
  label: string;
};

type TabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function Tabs<T extends string>({ tabs, value, onChange, className = "" }: TabsProps<T>) {
  return (
    <div className={`flex gap-1 border-b border-border-subtle ${className}`} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition ${
            value === tab.value
              ? "border-brand text-brand-strong"
              : "border-transparent text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
