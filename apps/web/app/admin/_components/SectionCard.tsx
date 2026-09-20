export function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface-raised p-5 shadow-sm sm:p-8">
      <div className="mb-6 flex items-start gap-4 border-b border-border-subtle pb-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-strong">
          {icon}
        </span>
        <div>
          <h2 className="heading-lg text-ink-primary">{title}</h2>
          <p className="body-md mt-0.5 text-ink-secondary">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
