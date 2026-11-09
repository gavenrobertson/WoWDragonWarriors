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
  const [mode3d, setMode3d] = useState<"off" | "loading" | "ready" | "failed">(slug ? "loading" : "off");
  const [missing, setMissing] = useState(0);
  const [anim, setAnim] = useState("Stand");
  const handle = useRef<Model3DHandle | null>(null);
  const is3d = mode3d === "ready";
  const drag = useRef<{ x: number; a: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);

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
            <polygon points="200,60 321,270 79,270" fill="none" stroke="#9B5DFF" strokeOpacity=".5" strokeWidth="2" />
            <polygon points="200,340 79,130 321,130" fill="none" stroke="#9B5DFF" strokeOpacity=".5" strokeWidth="2" />
            <circle cx="200" cy="200" r="110" fill="none" stroke="#C9A13B" strokeOpacity=".4" strokeWidth="1" />
          </svg>
        </div>

        {slug && mode3d !== "failed" && (
          <div className={`model3d-layer${is3d ? " ready" : ""}`}>
            <Model3D slug={slug} handleRef={handle} autoRotate={auto && is3d}
              onState={(st, info) => { setMode3d(st); if (info) setMissing(info.missing); }} />
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
              : showRender ? "Official Battle.net render · /character-media" : "Render appears after the next profile sync (Blizzard can take a day)"}
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
