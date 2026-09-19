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
    <section className="card p-5 sm:p-8">
      <div className="mb-6 flex items-start gap-4 border-b border-stone-100 pb-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-subtle-fg">
          {icon}
        </span>
        <div>
          <h2 className="text-xl font-bold text-stone-900">{title}</h2>
          <p className="mt-0.5 text-sm text-stone-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
