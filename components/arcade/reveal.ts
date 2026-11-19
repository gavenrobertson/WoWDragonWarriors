"use client";
// Phones: bring part of a game (the wheel, the board) into view just under the sticky header and arcade bar,
// when the player has scrolled down to the controls and is about to miss what happens.
export function revealOnPhone(el: Element | null | undefined) {
  if (!el || typeof window === "undefined" || !matchMedia("(max-width: 600px)").matches) return;
  const hdr = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 64;
  const bar = document.querySelector(".arcade-bar")?.getBoundingClientRect().height ?? 48;
  const chrome = hdr + bar + 6;
  const r = el.getBoundingClientRect();
  if (r.top >= chrome - 2 && r.top < innerHeight * 0.4) return; // already in view
  window.scrollTo({ top: Math.max(0, r.top + scrollY - chrome), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
