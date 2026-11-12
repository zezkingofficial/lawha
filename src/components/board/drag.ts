'use client';
// Pointer drag for reordering rows, cards, groups and columns. A light copy of the thing
// follows the finger or mouse, a line shows where it will land, and on release the data
// layer moves it (instantly, the layer is optimistic) while the copy glides into place.
//
// Mouse: press and move a few pixels. Touch: press and hold briefly (so scrolling still
// works), then move. Esc cancels.

export type Side = 'before' | 'after';
export interface DropTarget { el: HTMLElement; id: string; side: Side }

export interface DragOptions {
  axis: 'x' | 'y';
  /** the element under the pointer that will be copied as the moving ghost */
  source: HTMLElement;
  /** the id of what is being dragged */
  id: string;
  /** possible landing spots, looked up fresh on every move (layout may change mid-drag) */
  targets: () => HTMLElement[];
  /** id of a target element (default: data-drag-id) */
  idOf?: (el: HTMLElement) => string;
  /** how tall/wide the drop line is drawn across (default: the target) */
  lineBox?: (t: HTMLElement) => DOMRect;
  /** element that scrolls sideways, for columns */
  scroller?: HTMLElement | null;
  /** what to fade while it is being moved (default: source); a display:contents row fades its cells */
  dim?: HTMLElement;
  onStart?: (pointer: { x: number; y: number; grabY: number }) => void;
  onDrop: (to: DropTarget | null) => void;
  /** runs after a drop or a cancel */
  onEnd?: () => void;
  /** after the drop re-renders: the elements to glide from the ghost's spot into place (first one decides the distance) */
  settle?: () => HTMLElement[];
}

const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-no-drag], [role="dialog"]';
const HOLD_MS = 260;

export function isDragBlocked(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(NO_DRAG);
}

/** Call from onPointerDown. Returns nothing; the drag runs until release. */
export function beginDrag(e: React.PointerEvent | PointerEvent, opts: DragOptions) {
  if (e.button !== 0 || isDragBlocked(e.target)) return;
  const touch = e.pointerType !== 'mouse';
  const x0 = e.clientX, y0 = e.clientY;
  let started = false;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let ghost: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let grab = { dx: 0, dy: 0 };
  let last: DropTarget | null = null;
  let px = x0, py = y0;
  let raf = 0;
  const rtl = getComputedStyle(opts.source).direction === 'rtl';
  const idOf = opts.idOf ?? ((el: HTMLElement) => el.dataset.dragId ?? '');

  const start = () => {
    started = true;
    clearTimeout(holdTimer);
    const r = opts.source.getBoundingClientRect();
    grab = { dx: px - r.left, dy: py - r.top };
    ghost = opts.source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0',
      zIndex: '60', pointerEvents: 'none', opacity: '0.96', boxShadow: '0 12px 28px rgb(0 0 0 / .18), 0 2px 6px rgb(0 0 0 / .12)',
      transform: 'scale(1.015)', transition: 'transform 120ms ease-out', background: 'var(--c-bg)', borderRadius: '6px', overflow: 'hidden',
      willChange: 'left, top',
    });
    document.body.appendChild(ghost);
    line = document.createElement('div');
    Object.assign(line.style, { position: 'fixed', zIndex: '59', pointerEvents: 'none', background: 'var(--c-accent)', borderRadius: '2px', display: 'none', boxShadow: '0 0 0 2px color-mix(in srgb, var(--c-accent) 25%, transparent)' });
    document.body.appendChild(line);
    (opts.dim ?? opts.source).setAttribute('data-dragging', '');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    if (touch) navigator.vibrate?.(8);
    opts.onStart?.({ x: px, y: py, grabY: grab.dy });
    tick();
  };

  const findTarget = (): DropTarget | null => {
    const list = opts.targets();
    let best: { el: HTMLElement; d: number } | null = null;
    for (const el of list) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const d = opts.axis === 'y'
        ? (py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0)
        : (px < r.left ? r.left - px : px > r.right ? px - r.right : 0);
      if (!best || d < best.d) best = { el, d };
    }
    if (!best) return null;
    const r = best.el.getBoundingClientRect();
    let side: Side;
    if (opts.axis === 'y') side = py < r.top + r.height / 2 ? 'before' : 'after';
    else side = (rtl ? px > r.left + r.width / 2 : px < r.left + r.width / 2) ? 'before' : 'after';
    return { el: best.el, id: idOf(best.el), side };
  };

  const drawLine = (t: DropTarget | null) => {
    if (!line) return;
    if (!t) { line.style.display = 'none'; return; }
    const r = t.el.getBoundingClientRect();
    const box = opts.lineBox?.(t.el) ?? r;
    line.style.display = 'block';
    if (opts.axis === 'y') {
      const y = t.side === 'before' ? r.top : r.bottom;
      Object.assign(line.style, { left: `${box.left}px`, width: `${box.width}px`, top: `${y - 1.5}px`, height: '3px' });
    } else {
      const startEdge = rtl ? r.right : r.left, endEdge = rtl ? r.left : r.right;
      const x = t.side === 'before' ? startEdge : endEdge;
      Object.assign(line.style, { top: `${box.top}px`, height: `${box.height}px`, left: `${x - 1.5}px`, width: '3px' });
    }
  };

  // follow the pointer once per frame, and scroll when it nears an edge
  const tick = () => {
    if (!started || !ghost) return;
    ghost.style.left = `${opts.axis === 'y' ? Number.parseFloat(ghost.style.left) : px - grab.dx}px`;
    ghost.style.top = `${opts.axis === 'x' ? Number.parseFloat(ghost.style.top) : py - grab.dy}px`;
    const edge = 56;
    if (opts.axis === 'y') {
      if (py < edge) scrollBy(0, -Math.ceil((edge - py) / 4));
      else if (py > innerHeight - edge) scrollBy(0, Math.ceil((py - (innerHeight - edge)) / 4));
    } else if (opts.scroller) {
      const sr = opts.scroller.getBoundingClientRect();
      if (px < sr.left + edge) opts.scroller.scrollLeft -= Math.ceil((sr.left + edge - px) / 4);
      else if (px > sr.right - edge) opts.scroller.scrollLeft += Math.ceil((px - (sr.right - edge)) / 4);
    }
    last = findTarget();
    if (last && last.id === opts.id) last = null; // dropping onto itself changes nothing
    drawLine(last);
    raf = requestAnimationFrame(tick);
  };

  const move = (ev: PointerEvent) => {
    px = ev.clientX; py = ev.clientY;
    if (started) { ev.preventDefault(); return; }
    const far = Math.hypot(px - x0, py - y0);
    if (touch) { if (far > 10) cleanup(); } // moved before the hold: it is a scroll
    else if (far > 5) start();
  };
  const up = () => {
    if (!started) { cleanup(); return; }
    // a drag is not a click on whatever was under the pointer
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
    const target = last;
    const from = ghost?.getBoundingClientRect();
    finish();
    opts.onDrop(target);
    opts.onEnd?.();
    if (from && opts.settle) requestAnimationFrame(() => requestAnimationFrame(() => glide(opts.settle!(), from)));
  };
  const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { finish(); opts.onEnd?.(); } };
  const cancel = () => { const was = started; finish(); if (was) opts.onEnd?.(); };
  const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  const block = (ev: TouchEvent) => { if (started) ev.preventDefault(); };

  const finish = () => {
    started = false;
    cancelAnimationFrame(raf);
    ghost?.remove(); line?.remove();
    (opts.dim ?? opts.source).removeAttribute('data-dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    cleanup();
  };
  const cleanup = () => {
    clearTimeout(holdTimer);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
    removeEventListener('keydown', key);
    removeEventListener('touchmove', block);
  };

  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cancel);
  addEventListener('keydown', key);
  addEventListener('touchmove', block, { passive: false });
  if (touch) holdTimer = setTimeout(start, HOLD_MS);
}

// the moved thing slides from where it was let go into its new place
function glide(els: HTMLElement[], from: DOMRect) {
  if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = els[0].getBoundingClientRect();
  const dx = from.left - to.left, dy = from.top - to.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  for (const el of els) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
