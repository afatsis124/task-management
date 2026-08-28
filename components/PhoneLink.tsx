"use client";
import { useState } from "react";

/**
 * Turns a stored phone value into something a dialer can use.
 * Keeps digits and a leading "+", drops spaces, dots, dashes and brackets.
 * Returns null for junk values like "-", "." or "????" so they stay plain text.
 */
function toDialable(value: string): string | null {
  const cleaned = value.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return cleaned;
}

type PhoneLinkProps = {
  /** The phone number as stored (may be empty, "-", or messy). */
  value: string | null | undefined;
  /** Extra classes for the number itself, so it matches the surrounding text. */
  className?: string;
  /** Shown when there is no usable number. */
  fallback?: string;
};

/**
 * A phone number that an employee can actually use:
 *  - on a phone, tapping it opens the dialer ready to call
 *  - on a computer, a copy button puts it on the clipboard
 * Unusable values are rendered as plain text, exactly as before.
 */
export default function PhoneLink({
  value,
  className = "",
  fallback = "—",
}: PhoneLinkProps) {
  const [copied, setCopied] = useState(false);

  const raw = (value ?? "").trim();
  const dialable = raw ? toDialable(raw) : null;

  if (!dialable) {
    return <span className={className}>{raw || fallback}</span>;
  }

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(dialable);
      ok = true;
    } catch {
      // Older browsers, or clipboard permission denied.
      try {
        const box = document.createElement("textarea");
        box.value = dialable;
        box.style.position = "fixed";
        box.style.opacity = "0";
        document.body.appendChild(box);
        box.select();
        ok = document.execCommand("copy");
        document.body.removeChild(box);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={`tel:${dialable}`} className={`hover:underline ${className}`}>
        {raw}
      </a>
      {/* Hidden on phones, where tapping the number is the natural action. */}
      <button
        type="button"
        onClick={copy}
        title={copied ? "Αντιγράφηκε" : "Αντιγραφή αριθμού"}
        aria-label={copied ? "Αντιγράφηκε" : "Αντιγραφή αριθμού"}
        className="hidden sm:inline-flex text-gray-400 hover:text-blue-600 transition"
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </span>
  );
}
