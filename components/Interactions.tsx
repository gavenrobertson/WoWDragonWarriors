"use client";
// Site-wide pointer + scroll effects:
//  - cursor spotlight on cards (sets --mx/--my on the hovered surface)
//  - 3D tilt on [data-tilt] elements
//  - scroll-reveal for surfaces that start below the fold
// All disabled under prefers-reduced-motion; touch devices get reveal only.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SURFACES = ".panel, .panel-royal, .hero, .select-card, .list-row, .tile, .table-wrap, .inset";

export function Interactions() {
  const path = usePathname();

  useEffect(() => {
    // Expose the sticky header's height so other sticky bars can sit right below it.
    const h = document.querySelector(".site-header") as HTMLElement | null;
    if (!h) return;
    const set = () => document.documentElement.style.setProperty("--hdr-h", `${h.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set); ro.observe(h);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fine = matchMedia("(pointer: fine)").matches;
    let tilted: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const t = e.target as Element | null;
      const s = t?.closest?.(SURFACES) as HTMLElement | null;
      if (s) {
        const r = s.getBoundingClientRect();
        s.style.setProperty("--mx", `${e.clientX - r.left}px`);
        s.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const tilt = t?.closest?.("[data-tilt]") as HTMLElement | null;
      if (tilted && tilted !== tilt) { tilted.style.transform = ""; tilted = null; }
      if (tilt && fine) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-3px)`;
        tilted = tilt;
      }
    };
    const onLeave = () => { if (tilted) { tilted.style.transform = ""; tilted = null; } };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => { document.removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("pointerleave", onLeave); };
  }, []);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("revealed"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const scan = () => {
      document.querySelectorAll<HTMLElement>("main .panel, main .table-wrap, main .grid-auto > *, main .split > *").forEach((el) => {
        if (el.dataset.revealSeen) return;
        el.dataset.revealSeen = "1";
        // Only hide things that start off-screen, so nothing visible ever flashes.
        if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("reveal"); io.observe(el); }
      });
    };
    const t = setTimeout(scan, 50);
    const mo = new MutationObserver(() => scan());
    const main = document.querySelector("main");
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => { clearTimeout(t); io.disconnect(); mo.disconnect(); };
  }, [path]);

  return null;
}
