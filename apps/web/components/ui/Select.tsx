import { type ComponentPropsWithoutRef } from "react";

type SelectProps = ComponentPropsWithoutRef<"select"> & {
  /** Makes the select full-width of its container. */
  fullWidth?: boolean;
};

export function Select({ fullWidth, className = "", ...rest }: SelectProps) {
  return (
    <select
      className={`min-h-12 rounded-sm border border-border-subtle bg-surface-sunken px-3 text-sm text-ink-primary outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
}
