"use client";
export function Toast({ toast }: { toast: { text: string; error?: boolean } | null }) {
  if (!toast) return null;
  return <div className={toast.error ? "toast error" : "toast"} role="status" aria-live="polite">{toast.text}</div>;
}
