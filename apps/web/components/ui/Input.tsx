import { IconSearch } from "../icons";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  pill?: boolean;
  label?: string;
  error?: string;
  helperText?: string;
};

const FIELD_BASE =
  "body-md min-h-11 w-full border border-border-strong bg-surface-raised text-ink-primary shadow-sm outline-none placeholder:text-ink-faint focus:border-brand focus:ring-3 focus:ring-brand/15";

const FIELD_ERROR = "border-status-danger focus:border-status-danger focus:ring-status-danger/20";

export function Input({ pill, label, error, helperText, className = "", id, ...props }: InputProps) {
  if (pill) {
    return (
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input {...props} id={id} className={`${FIELD_BASE} rounded-pill py-2 pl-10 pr-4 ${className}`} />
      </div>
    );
  }

  const inputEl = (
    <input
      {...props}
      id={id}
      className={`${FIELD_BASE} rounded-lg px-3.5 ${error ? FIELD_ERROR : ""} ${className}`}
    />
  );

  if (!label && !error && !helperText) return inputEl;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="label-sm text-ink-faint">
          {label}
        </label>
      )}
      {inputEl}
      {error ? (
        <p className="body-sm text-status-error">{error}</p>
      ) : helperText ? (
        <p className="body-sm text-ink-faint">{helperText}</p>
      ) : null}
    </div>
  );
}
