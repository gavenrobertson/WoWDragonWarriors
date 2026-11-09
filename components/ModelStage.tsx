"use client";
// Character "model" stage: Blizzard's official full-body render (/character-media) on a rune pedestal.
// The API has no 3D models, so the render turns on a turntable (CSS 3D), mirrored when facing away.
import { useCallback, useEffect, useRef, useState } from "react";
import { IconRotL, IconRotR } from "./icons";
import { Model3D, type Model3DHandle } from "./Model3D";

const RUNES = "ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛇ ᛈ ᛉ ᛊ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ · DRAGON WARRIORS · ";

export function ModelStage({ name, color, renderUrl, slug }: { name: string; color: string; renderUrl: string | null; slug?: string }) {
  const [angle, setAngle] = useState(0);
  const [auto, setAuto] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode3d, setMode3d] = useState<"off" | "loading" | "ready" | "failed">("off");
  // The 3D model is ~25 MB, so it loads only when wanted: automatically on desktops once the stage is in view
  // and the page is idle; on phones and slow or data-saver connections, when the visitor taps "View in 3D".
  const [want3d, setWant3d] = useState(false);
  const [autoLoad, setAutoLoad] = useState<boolean | null>(null);
  const [missing, setMissing] = useState(0);
  const [why2d, setWhy2d] = useState<string | null>(null);
  const [anim, setAnim] = useState("Stand");
  const handle = useRef<Model3DHandle | null>(null);
  const is3d = mode3d === "ready";
  const drag = useRef<{ x: number; a: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!slug) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const lean = matchMedia("(max-width: 860px)").matches || !!conn?.saveData || /(^|-)2g|3g/.test(conn?.effectiveType ?? "");
    setAutoLoad(!lean);
    if (lean) return;
    const el = stage.current; if (!el) return;
    let idle = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const go = () => setWant3d(true);
      const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
      idle = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2500 }) : (setTimeout(go, 800) as unknown as number);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { io.disconnect(); const w = window as unknown as { cancelIdleCallback?: (n: number) => void }; if (w.cancelIdleCallback) w.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [slug]);

  // Auto-rotate (off under reduced motion).
  useEffect(() => {
    if (is3d || !auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => { setAngle((a) => a + (t - last) * 0.03); last = t; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, is3d]);

  useEffect(() => {
    setFailed(false);
    // A cached image can finish loading before React attaches onLoad, so check on mount too.
    const el = img.current;
    setLoaded(!!el && el.complete && el.naturalWidth > 0);
  }, [renderUrl]);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (is3d) { setAuto(false); return; } // the 3D viewer handles its own drag/zoom
    drag.current = { x: e.clientX, a: angle };
    setDragging(true);
    setAuto(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [angle, is3d]);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (drag.current) setAngle(drag.current.a + (e.clientX - drag.current.x) * 0.6);
  }, []);
  const onUp = useCallback(() => { drag.current = null; setDragging(false); }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { turn(-1); e.preventDefault(); }
    if (e.key === "ArrowRight") { turn(1); e.preventDefault(); }
  };

  const turn = (dir: number) => { setAuto(false); if (is3d) handle.current?.rotate(dir * Math.PI / 4); else setAngle((a) => a + dir * 45); };
  const reset = () => { setAuto(false); if (is3d) handle.current?.reset(); else setAngle(0); };
  const norm = ((Math.round(angle) % 360) + 360) % 360;
  const facingAway = norm > 90 && norm < 270;
  const showRender = !!renderUrl && !failed;

  return (
    <div className="model-stage" style={{ "--cls": color } as React.CSSProperties}>
      <div className="row between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--dw-border)", position: "relative", zIndex: 2 }}>
        <span className="small strong soft">Character model</span>
        <span className="micro muted">
          {is3d ? "3D model · drag to turn, scroll to zoom" : mode3d === "loading" ? "Loading 3D model…" : `Facing ${norm}° · drag to turn`}
        </span>
      </div>

      <div
        ref={stage}
        className={`model-canvas${dragging || auto ? " dragging" : ""}`}
        role="img"
        aria-label={`${name}, official Battle.net render. Use left and right arrow keys to turn.`}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div className="stage-aura" aria-hidden="true" />
        <div className="stage-beam" aria-hidden="true" />
        <div className="stage-sparks" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>

        <div className="pedestal" aria-hidden="true">
          <svg viewBox="0 0 400 400" className="rune-ring">
            <defs><path id="runePath" d="M200,200 m-170,0 a170,170 0 1,1 340,0 a170,170 0 1,1 -340,0" /></defs>
            <circle cx="200" cy="200" r="190" fill="none" stroke="#C9A13B" strokeOpacity=".55" strokeWidth="2" />
            <circle cx="200" cy="200" r="150" fill="none" stroke="#E3B341" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="4 10" />
            <text fill="#F5D77E" fillOpacity=".75" fontSize="19" fontFamily="Marcellus, serif" letterSpacing="3">
              <textPath href="#runePath">{RUNES + RUNES}</textPath>
            </text>
          </svg>
          <svg viewBox="0 0 400 400" className="rune-ring inner">
            <defs>
              <radialGradient id="pedGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#9B5DFF" stopOpacity=".28" /><stop offset=".7" stopColor="#9B5DFF" stopOpacity=".06" /><stop offset="1" stopColor="#9B5DFF" stopOpacity="0" /></radialGradient>
            </defs>
            <circle cx="200" cy="200" r="118" fill="url(#pedGlow)" />
            <circle cx="200" cy="200" r="118" fill="none" stroke="#C9A13B" strokeOpacity=".45" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="96" fill="none" stroke="#9B5DFF" strokeOpacity=".45" strokeWidth="1.2" strokeDasharray="2 7" />
            <circle cx="200" cy="200" r="62" fill="none" stroke="#C9A13B" strokeOpacity=".3" strokeWidth="1" />
            {/* tick marks around the ring */}
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i * 15 * Math.PI) / 180, long = i % 6 === 0, r1 = long ? 104 : 109, r2 = 118;
              const f = (v: number) => Math.round(v * 100) / 100;
              return <line key={i} x1={f(200 + r1 * Math.cos(a))} y1={f(200 + r1 * Math.sin(a))} x2={f(200 + r2 * Math.cos(a))} y2={f(200 + r2 * Math.sin(a))} stroke="#E3B341" strokeOpacity={long ? 0.7 : 0.35} strokeWidth={long ? 2 : 1} />;
            })}
            {/* gold studs at the four compass points */}
            {[0, 90, 180, 270].map((deg) => {
              const a = (deg * Math.PI) / 180, x = Math.round(200 + 118 * Math.cos(a)), y = Math.round(200 + 118 * Math.sin(a));
              return <rect key={deg} x={x - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${x} ${y})`} fill="#C9A13B" stroke="#1a1206" strokeWidth="1.5" />;
            })}
          </svg>
        </div>

        {slug && !want3d && autoLoad === false && (
          <button type="button" className="view3d-btn" onClick={() => setWant3d(true)}>
            <span className="view3d-cube" aria-hidden="true">⬢</span> View in 3D <span className="micro">about 25 MB</span>
          </button>
        )}
        {slug && want3d && mode3d !== "failed" && (
          <div className={`model3d-layer${is3d ? " ready" : ""}`}>
            <Model3D slug={slug} handleRef={handle} autoRotate={auto && is3d}
              onState={(st, info) => { setMode3d(st); if (info?.missing != null) setMissing(info.missing); if (st === "failed") setWhy2d(info?.reason ?? null); }} />
          </div>
        )}

        <div className={`turntable${is3d ? " hidden-3d" : ""}`} style={{ transform: `rotateY(${angle}deg)` }}>
          <div className="float">
            {showRender ? (
              <img
                ref={img}
                src={renderUrl!}
                alt=""
                draggable={false}
                className={`model-render${loaded ? " loaded" : ""}`}
                style={{ transform: facingAway ? "scaleX(-1)" : undefined }}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            ) : (
              <svg width="200" height="380" viewBox="0 0 200 380" aria-hidden="true" className="model-render loaded silhouette">
                <g fill="#231D19" stroke="#7a5e2a" strokeWidth="2" strokeLinejoin="round">
                  <circle cx="100" cy="52" r="30" />
                  <path d="M46 110 C58 92 78 86 100 86 C122 86 142 92 154 110 L166 196 L144 202 L136 150 L134 230 L66 230 L64 150 L56 202 L34 196 Z" />
                  <path d="M68 232 L132 232 L128 346 L106 350 L100 262 L94 350 L72 346 Z" />
                </g>
              </svg>
            )}
          </div>
        </div>

        <div className="model-caption">
          <span className="small strong" style={{ color }}>{name}</span>
          <span className="micro muted">
            {is3d ? `Live 3D model${missing ? ` · ${missing} item${missing === 1 ? "" : "s"} not shown yet` : ""}`
              : showRender ? `Official Battle.net render${why2d ? ` · ${why2d}` : ""}` : "Render appears after the next profile sync (Blizzard can take a day)"}
          </span>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--dw-border)", position: "relative", zIndex: 2 }}>
        <button type="button" className="icon-btn" aria-label="Turn left" onClick={() => turn(-1)}><IconRotL /></button>
        <button type="button" className="btn btn-sm" onClick={reset}>Reset</button>
        {is3d && <>
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => handle.current?.zoom(-1)}>−</button>
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => handle.current?.zoom(1)}>+</button>
        </>}
        <button type="button" className="icon-btn" aria-label="Turn right" onClick={() => turn(1)}><IconRotR /></button>
        <button type="button" className="btn btn-sm" aria-pressed={auto} onClick={() => setAuto(!auto)} style={auto ? { borderColor: "var(--dw-gold)" } : undefined}>
          Auto-rotate
        </button>
        {is3d && (
          <label className="row small strong" style={{ gap: 6 }}>
            <span className="visually-hidden">Animation</span>
            <select value={anim} onChange={(e) => { setAnim(e.target.value); handle.current?.animate(e.target.value); }} style={{ minHeight: 40 }}>
              {["Stand", "Walk", "Run", "EmoteDance", "EmoteWave", "EmoteCheer", "EmoteSalute", "EmoteRoar", "EmoteFlex", "EmoteBow", "EmoteLaugh", "EmoteKneel", "SpellCastDirected", "ReadySpellDirected"].map((a) => (
                <option key={a} value={a}>{a.replace(/^Emote/, "").replace(/([a-z])([A-Z])/g, "$1 $2")}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
