"use client";
import { useCallback, useState, useTransition } from "react";

export type ActionResult = { ok: true; message?: string; demo?: boolean } | { ok: false; error: string };

/** Runs a server action, tracks pending state and shows a short toast with the result. */
export function useAction() {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const run = useCallback((fn: () => Promise<ActionResult>, onOk?: () => void) => {
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          onOk?.();
          if (r.message || r.demo) setToast({ text: r.message ?? "Saved", ...(r.demo ? { text: `${r.message ?? "Done"} (demo: not saved)` } : {}) });
        } else setToast({ text: r.error, error: true });
      } catch (e) {
        setToast({ text: e instanceof Error ? e.message : "Something went wrong", error: true });
      }
      setTimeout(() => setToast(null), 3200);
    });
  }, []);
  return { pending, run, toast };
}
