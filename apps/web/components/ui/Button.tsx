type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "large";
};

const VARIANT_STYLES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand text-on-brand shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-brand-strong active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.18)] disabled:bg-surface-sunken disabled:text-ink-faint disabled:shadow-none",
  danger:
    "bg-status-danger text-on-brand shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-95 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.18)] disabled:bg-surface-sunken disabled:text-ink-faint disabled:shadow-none",
  secondary:
    "border border-border-strong bg-surface-raised text-ink-primary hover:bg-surface-sunken disabled:border-border-subtle disabled:text-ink-faint",
  ghost: "text-ink-secondary hover:bg-surface-sunken disabled:text-ink-faint",
};

const SIZE_STYLES: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "min-h-12 px-5 text-sm",
  large: "min-h-14 px-6 text-base",
};

export function Button({ variant = "primary", size = "default", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-body font-semibold transition disabled:cursor-not-allowed ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
    />
  );
}
