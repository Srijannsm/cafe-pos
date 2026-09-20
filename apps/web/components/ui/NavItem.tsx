import Link from "next/link";

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
};

export function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-semibold transition ${
        active ? "bg-brand-tint text-brand-strong" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
