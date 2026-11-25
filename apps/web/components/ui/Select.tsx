import { type ComponentPropsWithoutRef } from "react";

type SelectProps = ComponentPropsWithoutRef<"select"> & {
  /** Makes the select full-width of its container. */
  fullWidth?: boolean;
};

export function Select({ fullWidth, className = "", ...rest }: SelectProps) {
  return (
    <select
      className={`min-h-11 rounded-lg border border-border-strong bg-surface-raised px-3 text-sm text-ink-primary shadow-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15 ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
}
