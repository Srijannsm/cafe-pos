import type { ReactNode } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "large";
  icon?: ReactNode;
  loading?: boolean;
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

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "default",
  icon,
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-body font-semibold transition disabled:cursor-not-allowed ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
    >
      {loading ? <Spinner /> : icon ? <span className="h-4 w-4 shrink-0 [&>svg]:h-full [&>svg]:w-full">{icon}</span> : null}
      {children}
    </button>
  );
}
