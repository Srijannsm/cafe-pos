import { IconSearch } from "../icons";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  pill?: boolean;
};

const FIELD_BASE =
  "body-md min-h-12 w-full border border-border-subtle bg-surface-sunken text-ink-primary shadow-[inset_0_1px_2px_rgba(42,38,32,0.08)] outline-none placeholder:text-ink-faint focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30";

export function Input({ pill, className = "", ...props }: InputProps) {
  if (pill) {
    return (
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input {...props} className={`${FIELD_BASE} rounded-pill py-2 pl-10 pr-4 ${className}`} />
      </div>
    );
  }
  return <input {...props} className={`${FIELD_BASE} rounded-sm px-3 ${className}`} />;
}
