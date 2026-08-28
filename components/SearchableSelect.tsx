"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  /** The list of choices to show. */
  options: SearchableSelectOption[];
  /** The currently selected value ("" means nothing selected). */
  value: string;
  /** Called with the new value when the user picks something. */
  onChange: (value: string) => void;
  /** Text shown on the button when nothing is selected. */
  placeholder?: string;
  /** Text shown inside the search box. */
  searchPlaceholder?: string;
  /** Text shown when the search finds nothing. */
  emptyMessage?: string;
  /** Blocks interaction when true. */
  disabled?: boolean;
  /** Makes the field required for form validation. */
  required?: boolean;
  /** Form field name (used by the hidden input). */
  name?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
};

/**
 * Strips accents and lowercases, so typing "θεσσαλονικη" matches
 * "Θεσσαλονίκη" and "kolonaki" matches "Kolonáki".
 */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accent marks
    .replace(/ς/g, "σ") // final sigma -> sigma
    .toLowerCase()
    .trim();
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Επιλέξτε...",
  searchPlaceholder = "Αναζήτηση...",
  emptyMessage = "Δεν βρέθηκαν αποτελέσματα",
  disabled = false,
  required = false,
  name,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    // Every typed word must appear somewhere in the label, so
    // "kolonaki 3" finds "Σκουφά 3 (Κολωνάκι)".
    const words = q.split(/\s+/);
    return options.filter((o) => {
      const label = normalize(o.label);
      return words.every((w) => label.includes(w));
    });
  }, [options, query]);

  // Keeps the newest options/value reachable from the "on open" effect below
  // without making that effect re-run on every parent render.
  const latest = useRef({ options, value });
  latest.current = { options, value };

  // Close when clicking outside.
  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  // On open: clear the search, focus it, highlight the current pick.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const { options: opts, value: val } = latest.current;
    const index = opts.findIndex((o) => o.value === val);
    setHighlighted(index >= 0 ? index : 0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.children[highlighted] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const pick = (option: SearchableSelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = filtered[highlighted];
      if (option) pick(option);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      {/*
        Invisible input that carries the "required" validation. It is stretched
        over the button (rather than sized 0) so the browser can focus it and
        anchor its "Συμπληρώστε αυτό το πεδίο" bubble in the right place —
        Chrome refuses to submit a form whose invalid control is unfocusable.
      */}
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <span className={selected ? "text-gray-900 truncate" : "text-gray-400 truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`ml-2 w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              placeholder={searchPlaceholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</li>
            )}
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlighted;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => pick(option)}
                  className={`px-3 py-2 text-sm cursor-pointer ${isHighlighted ? "bg-blue-50" : ""} ${
                    isSelected ? "font-medium text-blue-700" : "text-gray-900"
                  }`}
                >
                  {option.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
