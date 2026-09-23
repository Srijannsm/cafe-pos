type PageHeaderProps = {
  title: string;
  description?: string;
  /** Slot for right-aligned controls (filters, buttons). */
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  if (actions) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-md text-ink-primary">{title}</h1>
          {description && (
            <p className="body-md mt-1 text-ink-secondary">{description}</p>
          )}
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div>
      <h1 className="display-md text-ink-primary">{title}</h1>
      {description && (
        <p className="body-md mt-1 text-ink-secondary">{description}</p>
      )}
    </div>
  );
}
