import type { ReactNode } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "large" | "small";
  icon?: ReactNode;
  loading?: boolean;
};

const VARIANT_STYLES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand text-on-brand shadow-sm hover:bg-brand-strong disabled:bg-surface-sunken disabled:text-ink-faint disabled:shadow-none",
  danger:
    "bg-status-danger text-white shadow-sm hover:brightness-95 disabled:bg-surface-sunken disabled:text-ink-faint disabled:shadow-none",
  secondary:
    "border border-border-strong bg-surface-raised text-ink-secondary shadow-sm hover:bg-surface-canvas hover:text-ink-primary disabled:border-border-subtle disabled:text-ink-faint",
  ghost: "text-ink-secondary hover:bg-surface-sunken disabled:text-ink-faint",
};

const SIZE_STYLES: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "min-h-11 px-4 text-sm",
  large: "min-h-13 px-6 text-base",
  small: "min-h-9 px-3 text-xs",
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-body font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring/40 disabled:cursor-not-allowed ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
    >
      {loading ? <Spinner /> : icon ? <span className="h-4 w-4 shrink-0 [&>svg]:h-full [&>svg]:w-full">{icon}</span> : null}
      {children}
    </button>
  );
}
