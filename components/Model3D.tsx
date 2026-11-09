"use client";
// Real 3D character model using Wowhead's ZamModelViewer, fed by Blizzard appearance data
// (race, gender, customization choices, equipped item display IDs) from /api/model/[slug].
// Model files load through our same-origin relay (/modelviewer/live/...).
import { useEffect, useRef, useState } from "react";

type ModelConfig = { modelId: number; options: { optionId: number; choiceId: number }[]; items: [number, number][]; missing: number };
type Zoom = { target: number; current: number; rateCurrent: number; range: [number, number] };
type Viewer = { renderer?: { azimuth: number; zenith: number; distance: number; zoom?: Zoom; actors?: { setAnimation?: (n: string) => void; getNumAnimations?: () => number }[] }; destroy?: () => void };

declare global {
  interface Window { ZamModelViewer?: new (opts: unknown) => Viewer; jQuery?: (el: Element) => unknown; WH?: Record<string, unknown>; CONTENT_PATH?: string }
}

const JQUERY = "https://code.jquery.com/jquery-3.7.1.min.js";
let loader: Promise<void> | null = null;

// Zoom units used by Wowhead's viewer (higher = closer). 1 is the default framing.
const ZOOM_HOME = 1, ZOOM_MIN = -3, ZOOM_MAX = 7;
function setZoom(z: Zoom, target: number) {
  const lo = Math.max(ZOOM_MIN, z.range?.[0] ?? ZOOM_MIN), hi = Math.min(ZOOM_MAX, z.range?.[1] ?? ZOOM_MAX);
  z.target = Math.max(lo, Math.min(hi, target));
  z.rateCurrent = 0; // cancel any momentum from the viewer's accelerating zoom
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Globals the Wowhead viewer expects (mirrors wow-model-viewer's setup.js). */
function setupGlobals() {
  window.CONTENT_PATH = `${location.origin}/modelviewer/live/`;
  if (window.WH) return;
  window.WH = {
    debug: () => {},
    defaultAnimation: "Stand",
    WebP: { getImageExtension: () => ".webp" },
    Wow: { Item: {
      INVENTORY_TYPE_HEAD: 1, INVENTORY_TYPE_NECK: 2, INVENTORY_TYPE_SHOULDERS: 3, INVENTORY_TYPE_SHIRT: 4, INVENTORY_TYPE_CHEST: 5,
      INVENTORY_TYPE_WAIST: 6, INVENTORY_TYPE_LEGS: 7, INVENTORY_TYPE_FEET: 8, INVENTORY_TYPE_WRISTS: 9, INVENTORY_TYPE_HANDS: 10,
      INVENTORY_TYPE_FINGER: 11, INVENTORY_TYPE_TRINKET: 12, INVENTORY_TYPE_ONE_HAND: 13, INVENTORY_TYPE_SHIELD: 14, INVENTORY_TYPE_RANGED: 15,
      INVENTORY_TYPE_BACK: 16, INVENTORY_TYPE_TWO_HAND: 17, INVENTORY_TYPE_BAG: 18, INVENTORY_TYPE_TABARD: 19, INVENTORY_TYPE_ROBE: 20,
      INVENTORY_TYPE_MAIN_HAND: 21, INVENTORY_TYPE_OFF_HAND: 22, INVENTORY_TYPE_HELD_IN_OFF_HAND: 23, INVENTORY_TYPE_PROJECTILE: 24,
      INVENTORY_TYPE_THROWN: 25, INVENTORY_TYPE_RANGED_RIGHT: 26, INVENTORY_TYPE_QUIVER: 27, INVENTORY_TYPE_RELIC: 28,
    } },
  };
}

function loadViewer() {
  if (!loader) {
    setupGlobals();
    loader = loadScript(JQUERY).then(() => loadScript("/modelviewer/live/viewer/viewer.min.js"));
    loader.catch(() => { loader = null; });
  }
  return loader;
}

export type Model3DHandle = { rotate: (rad: number) => void; reset: () => void; zoom: (d: number) => void; animate: (name: string) => boolean };

export function Model3D({ slug, onState, handleRef, autoRotate }: {
  slug: string;
  onState: (s: "loading" | "ready" | "failed", info?: { missing: number }) => void;
  handleRef?: React.MutableRefObject<Model3DHandle | null>;
  autoRotate?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [mounted, setMounted] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/model/${encodeURIComponent(slug)}`);
        const { model } = (await res.json()) as { model: ModelConfig | null };
        if (!model) throw new Error("no model");
        await loadViewer();
        if (cancelled || !box.current || !window.ZamModelViewer || !window.jQuery) throw new Error("viewer unavailable");
        box.current.innerHTML = "";
        const el = document.createElement("div");
        el.className = "model3d-canvas";
        box.current.appendChild(el);
        const rect = box.current.getBoundingClientRect();
        viewer.current = await new window.ZamModelViewer({
          type: 2,
          contentPath: window.CONTENT_PATH,
          container: window.jQuery(el),
          aspect: rect.width / Math.max(1, rect.height),
          hd: true,
          items: model.items,
          models: { id: model.modelId, type: 16 },
          charCustomization: { options: model.options },
        });
        if (cancelled) return;
        // Handy for debugging in the browser console: document.querySelector('.model3d-canvas').__viewer
        (el as HTMLElement & { __viewer?: Viewer }).__viewer = viewer.current ?? undefined;
        // Reveal only once the character model has actually loaded (its animations are parsed from the
        // ~12 MB model file), so first-time visitors keep seeing the 2D render instead of an empty stage.
        const started = Date.now();
        const check = () => {
          if (cancelled) return;
          const actor = viewer.current?.renderer?.actors?.[0] as { getNumAnimations?: () => number } | undefined;
          let loaded = false;
          try { loaded = !!actor && (actor.getNumAnimations?.() ?? 0) > 0; } catch { loaded = false; }
          if (loaded && el.querySelector("canvas")) {
            // One more beat so textures finish binding before the fade-in.
            setTimeout(() => { if (!cancelled) { onState("ready", { missing: model.missing }); setMounted((m) => m + 1); } }, 400);
            return;
          }
          if (Date.now() - started > 90_000) { onState("failed"); return; }
          setTimeout(check, 250);
        };
        check();
      } catch {
        if (!cancelled) onState("failed");
      }
    })();
    return () => { cancelled = true; try { viewer.current?.destroy?.(); } catch { /* ignore */ } viewer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Calm, linear wheel zoom. The viewer's own wheel zoom accelerates with every notch
  // (three notches jumped ~6 of its ~27 zoom units), so we take the wheel over:
  // ~0.4 units per notch, proportional for trackpads, eased by the viewer's own interpolation.
  useEffect(() => {
    const el = box.current;
    if (!el || !mounted) return;
    const onWheel = (e: WheelEvent) => {
      const z = viewer.current?.renderer?.zoom;
      if (!z) return;
      e.preventDefault();
      e.stopPropagation();
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      setZoom(z, z.target - Math.max(-120, Math.min(120, px)) * 0.004);
    };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [mounted]);

  // Controls exposed to the stage buttons.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      rotate: (rad) => { const r = viewer.current?.renderer; if (r) r.azimuth += rad; },
      reset: () => { const r = viewer.current?.renderer; if (r) { r.azimuth = 0; r.zenith = 0; if (r.zoom) setZoom(r.zoom, ZOOM_HOME); } },
      zoom: (d) => { const z = viewer.current?.renderer?.zoom; if (z) setZoom(z, z.target + d); },
      animate: (name) => {
        try { viewer.current?.renderer?.actors?.[0]?.setAnimation?.(name); return true; } catch { return false; }
      },
    };
  }, [handleRef, mounted]);

  // Slow turntable spin.
  useEffect(() => {
    if (!autoRotate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => { const r = viewer.current?.renderer; if (r) r.azimuth += (t - last) * 0.0006; last = t; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, mounted]);

  return <div ref={box} className="model3d" />;
}
