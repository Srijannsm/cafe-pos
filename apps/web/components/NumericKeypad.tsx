"use client";

import { IconBackspace } from "./icons";

type NumericKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  shake?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function NumericKeypad({ value, onChange, maxLength, shake }: NumericKeypadProps) {
  function press(key: string) {
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length < maxLength) {
      onChange(value + key);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className={`flex gap-3 ${shake ? "animate-shake" : ""}`}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < value.length ? "border-primary bg-primary" : "border-stone-300 bg-transparent"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key === "" ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              aria-label={key === "back" ? "Delete last digit" : `Digit ${key}`}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border border-stone-200 bg-white text-xl font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 active:scale-95 sm:h-20 sm:w-20"
            >
              {key === "back" ? <IconBackspace className="h-6 w-6 text-stone-500" /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
