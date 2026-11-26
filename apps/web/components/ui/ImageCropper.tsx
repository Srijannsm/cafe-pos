"use client";

// Interactive crop dialog used by every image upload in the app (menu items,
// logo, cover photo, staff photos).
//
// How it works: the frame (the part that will be kept) has a fixed size and
// shape; the photo moves and zooms *behind* it. The photo is never allowed
// to leave a gap inside the frame, so whatever the person picks is always a
// fully-covered crop. The result is a rectangle in the photo's own pixels,
// which lib/image.ts then cuts out, resizes and compresses before upload.
//
// Use it through the hook, so a page only needs two extra lines:
//   const { crop, cropDialog } = useImageCropper();
//   const area = await crop(file, { aspect: 4 / 3 });   // null = cancelled
//   ...render {cropDialog} somewhere in the page.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CropArea } from "../../lib/image";
import { Button } from "./Button";
import { IconMinus, IconPlus, IconUndo, IconX } from "../icons";

export type CropOptions = {
  /** width / height of the result, e.g. 1 (square), 4/3, 16/9 */
  aspect: number;
  /** Shows a circle guide (the image itself stays square). */
  round?: boolean;
  title?: string;
  /** Shown under the title, e.g. "Shown on the QR menu card". */
  hint?: string;
};

const MAX_ZOOM = 4;
const PAD = 28; // dimmed margin around the frame, so you see what's cut off

export function useImageCropper() {
  const [req, setReq] = useState<{
    file: File;
    opts: CropOptions;
    resolve: (a: CropArea | null) => void;
    reject: (e: Error) => void;
  } | null>(null);

  const crop = useCallback(
    (file: File, opts: CropOptions) =>
      new Promise<CropArea | null>((resolve, reject) => {
        if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file (JPG, PNG or WebP)"));
        if (file.size > 15 * 1024 * 1024) return reject(new Error("That image is too large (max 15 MB)"));
        setReq({ file, opts, resolve, reject });
      }),
    [],
  );

  const cropDialog: ReactNode = req ? (
    <ImageCropper
      key={`${req.file.name}-${req.file.lastModified}`}
      file={req.file}
      {...req.opts}
      onDone={(area) => {
        req.resolve(area);
        setReq(null);
      }}
      onError={(e) => {
        req.reject(e);
        setReq(null);
      }}
    />
  ) : null;

  return { crop, cropDialog };
}

function ImageCropper({
  file, aspect, round = false, title = "Crop image", hint, onDone, onError,
}: CropOptions & { file: File; onDone: (a: CropArea | null) => void; onError: (e: Error) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null); // frame size on screen
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // photo's top-left, relative to the frame
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // onError is a new function on every parent render; keep the latest in a
  // ref so it doesn't re-run (and cancel) the load effect below.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  // Load the picked file. The cleanup revokes the blob URL, which makes a
  // still-loading <img> fail -- so a cleaned-up load must be ignored, not
  // reported as "format not supported" (this happens on every open in dev,
  // where React runs effects twice).
  useEffect(() => {
    let live = true;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      setSrc(url);
    };
    img.onerror = () => {
      if (live) onErrorRef.current(new Error("This image format isn't supported here -- please use JPG, PNG or WebP"));
    };
    img.src = url;
    return () => {
      live = false;
      // Still loading? Revoke once it settles, so the browser doesn't log a
      // failed request for a load we simply no longer need.
      if (img.complete) URL.revokeObjectURL(url);
      else img.onload = img.onerror = () => URL.revokeObjectURL(url);
    };
  }, [file]);

  // Frame size: as wide as the dialog allows, capped in height for tall
  // screens / wide aspect ratios. Re-measured on resize.
  useEffect(() => {
    const measure = () => {
      const avail = Math.min((wrapRef.current?.clientWidth ?? 520) - PAD * 2, 560);
      const maxH = Math.min(window.innerHeight * 0.5, 420);
      let w = avail;
      let h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      setBox({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [aspect]);

  const baseScale = nat && box ? Math.max(box.w / nat.w, box.h / nat.h) : 1;
  const scale = baseScale * zoom;

  const clamp = useCallback(
    (p: { x: number; y: number }, s: number) => {
      if (!nat || !box) return p;
      return {
        x: Math.min(0, Math.max(box.w - nat.w * s, p.x)),
        y: Math.min(0, Math.max(box.h - nat.h * s, p.y)),
      };
    },
    [nat, box],
  );

  // Start centred whenever the image or frame size is known/changes.
  useEffect(() => {
    if (!nat || !box) return;
    const s = Math.max(box.w / nat.w, box.h / nat.h);
    setZoom(1);
    setPos({ x: (box.w - nat.w * s) / 2, y: (box.h - nat.h * s) / 2 });
  }, [nat, box]);

  // Zoom around the frame's centre, so what's in the middle stays put.
  // (Kept as two independent state updates: nesting one setState inside
  // another's updater runs twice in React dev mode and makes zoom jump.)
  const zoomTo = useCallback(
    (next: number) => {
      if (!box) return;
      const z = Math.min(MAX_ZOOM, Math.max(1, next));
      const oldS = baseScale * zoom;
      const newS = baseScale * z;
      setPos((p) => {
        const cx = (box.w / 2 - p.x) / oldS;
        const cy = (box.h / 2 - p.y) / oldS;
        return clamp({ x: box.w / 2 - cx * newS, y: box.h / 2 - cy * newS }, newS);
      });
      setZoom(z);
    },
    [box, baseScale, zoom, clamp],
  );

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo((pinch.current.zoom * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.current.dist);
    } else if (pointers.current.size === 1) {
      setPos((p) => clamp({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }, scale));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function confirm() {
    if (!nat || !box) return;
    onDone({ x: -pos.x / scale, y: -pos.y / scale, width: box.w / scale, height: box.h / scale });
  }
  function reset() {
    if (!nat || !box) return;
    setZoom(1);
    setPos({ x: (box.w - nat.w * baseScale) / 2, y: (box.h - nat.h * baseScale) / 2 });
  }

  // Keyboard: Esc cancel, Enter use, arrows nudge, +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(null);
      else if (e.key === "Enter") confirm();
      else if (e.key === "+" || e.key === "=") zoomTo(zoom + 0.2);
      else if (e.key === "-") zoomTo(zoom - 0.2);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 40 : 10;
        const dx = e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0;
        const dy = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
        setPos((p) => clamp({ x: p.x + dx, y: p.y + dy }, scale));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[90] flex items-end justify-center bg-overlay-backdrop backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-pop flex w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-surface-raised shadow-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">{title}</h2>
            <p className="mt-0.5 text-sm text-ink-secondary">{hint ?? "Drag to reposition · pinch, scroll or use the slider to zoom"}</p>
          </div>
          <button type="button" aria-label="Cancel" onClick={() => onDone(null)} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-ink-primary">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div ref={wrapRef} className="flex justify-center bg-[#0c111d] px-0 py-0">
          {box && (
            <div
              className="relative touch-none select-none overflow-hidden"
              style={{ width: box.w + PAD * 2, height: box.h + PAD * 2, cursor: "grab" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => zoomTo(zoom * Math.exp(-e.deltaY * 0.0015))}
            >
              {src && nat ? (
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none origin-top-left"
                  style={{ left: PAD + pos.x, top: PAD + pos.y, width: nat.w * scale, height: nat.h * scale }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                </div>
              )}
              {/* The frame: everything outside it is dimmed. */}
              <div
                className={`pointer-events-none absolute border-2 border-white/90 ${round ? "rounded-full" : "rounded-md"}`}
                style={{ left: PAD, top: PAD, width: box.w, height: box.h, boxShadow: "0 0 0 9999px rgba(12,17,29,0.62)" }}
              >
                {/* Rule-of-thirds guides */}
                {!round && (
                  <>
                    <span className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                    <span className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                    <span className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                    <span className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-4">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom - 0.25)} className="rounded-lg p-2 text-ink-secondary hover:bg-surface-sunken"><IconMinus className="h-4 w-4" /></button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 flex-1 cursor-pointer accent-[var(--brand)]"
          />
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoom + 0.25)} className="rounded-lg p-2 text-ink-secondary hover:bg-surface-sunken"><IconPlus className="h-4 w-4" /></button>
          <button type="button" onClick={reset} className="ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-secondary hover:bg-surface-sunken"><IconUndo className="h-4 w-4" /> Reset</button>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <Button variant="secondary" onClick={() => onDone(null)}>Cancel</Button>
          <Button onClick={confirm} disabled={!nat}>Use image</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
