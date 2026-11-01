import {
  anchorsFor,
  guidesFor,
  resolveBackground,
  globalOpacity,
  type AnchorFrame,
  type Format,
  type GuideLine,
  type LayoutItem,
  type LibraryElement,
  type PaletteElement,
  type Project,
  alignPoint,
  snapBox,
  type Align,
  type Box,
  type Snap,
} from '@ftd/core';
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { fileUrl } from '../api';

interface Props {
  format: Format;
  project: Project;
  items: LayoutItem[];
  library: Map<string, LibraryElement>;
  frame: AnchorFrame;
  showGuides: boolean;
  /** Ancrages allumés pendant un glisser depuis la bibliothèque. */
  highlightAnchors: boolean;
  /** Ancrage visé par l'élément glissé depuis la bibliothèque (coordonnées normalisées). */
  ghostTarget: { x: number; y: number } | null;
  selectedId: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
  onSelect: (id: string | null) => void;
  /** Fin de déplacement : boîte déplacée et éventuelle accroche magnétique. */
  onMoveEnd: (id: string, box: Box, snap: Snap | null) => void;
  /** Fin de redimensionnement par poignée : facteur autour du point d'ancrage. */
  onScale: (id: string, factor: number) => void;
  onRotate: (id: string, degrees: number) => void;
  onDuplicate: (id: string) => void;
  /** Ordre d'empilement : +1 avance d'un cran, -1 recule d'un cran. */
  onLayer: (id: string, step: 1 | -1) => void;
  onDelete: (id: string) => void;
}

const STROKE: Record<GuideLine['weight'], { w: number; dash?: string; color: string }> = {
  half: { w: 1.4, color: 'var(--guide-strong)' },
  third: { w: 1, dash: '6 4', color: 'var(--guide)' },
  quarter: { w: 1, dash: '2 4', color: 'var(--guide)' },
  golden: { w: 1.4, color: 'var(--guide-golden)' },
  diagonal: { w: 1.2, color: 'var(--guide-radial)' },
  reciprocal: { w: 1, dash: '5 3', color: 'var(--guide-radial)' },
  rabattement: { w: 1, dash: '8 4', color: 'var(--guide-golden)' },
  grid: { w: 1, color: 'var(--guide)' },
};

/** Identifiant de sélection du fond (élément fixe). */
export const BACKGROUND_ID = '@fond';

/** Rayon d'attraction des ancrages, en pixels d'écran. */
export const MAGNET_PX = 30;

export function clientToFormat(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Unités du format par pixel d'écran. */
export function formatPerPixel(svg: SVGSVGElement | null): number {
  const a = svg?.getScreenCTM()?.a;
  return a ? 1 / a : 1;
}

type Pt = { x: number; y: number };

interface Gesture {
  kind: 'move' | 'scale' | 'rotate';
  id: string;
  start: Pt;
  pivot: Pt;
  startDist: number;
  startAngle: number;
  baseRotation: number;
  moved: boolean;
}

interface Live {
  id: string;
  dx: number;
  dy: number;
  scale: number;
  rotation?: number;
  snap: Snap | null;
}

const NO_LIVE = { dx: 0, dy: 0, scale: 1, rotation: undefined, snap: null };
const CORNERS: Align[] = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

/** Point d'un élément après rotation (autour de son centre), mise à l'échelle (autour du pivot) et déplacement. */
function place(p: Pt, it: LayoutItem, rotation: number, pivot: Pt, scale: number, dx: number, dy: number): Pt {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const r = (rotation * Math.PI) / 180;
  const rx = cx + (p.x - cx) * Math.cos(r) - (p.y - cy) * Math.sin(r);
  const ry = cy + (p.x - cx) * Math.sin(r) + (p.y - cy) * Math.cos(r);
  return { x: pivot.x + (rx - pivot.x) * scale + dx, y: pivot.y + (ry - pivot.y) * scale + dy };
}

export function Workspace(props: Props) {
  const { format, project, items, library, frame, showGuides, highlightAnchors, selectedId, svgRef } = props;
  const W = format.width;
  const H = format.height;
  const palette = project.palette ? (library.get(`palette/${project.palette}`) as PaletteElement | undefined) : undefined;
  const guides = useMemo(() => guidesFor(frame, format, project.grid), [frame, format, project.grid]);
  const anchors = useMemo(() => anchorsFor(frame, format, project.grid), [frame, format, project.grid]);
  const gesture = useRef<Gesture | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  // unités du format par pixel d'écran : poignées et traits gardent une taille constante
  const [px, setPx] = useState(1);
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      setPx(formatPerPixel(svg));
      setTick((t) => t + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef, W, H]);

  const pivotOf = (it: LayoutItem) => alignPoint(it, it.align);

  const begin = (e: React.PointerEvent, it: LayoutItem, kind: Gesture['kind']) => {
    e.stopPropagation();
    props.onSelect(it.id);
    const p = clientToFormat(svgRef.current!, e.clientX, e.clientY);
    const pivot = pivotOf(it);
    const center = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
    gesture.current = {
      kind,
      id: it.id,
      start: p,
      pivot,
      startDist: Math.hypot(p.x - pivot.x, p.y - pivot.y),
      startAngle: Math.atan2(p.y - center.y, p.x - center.x),
      baseRotation: it.rotation,
      moved: false,
    };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const it = items.find((i) => i.id === g.id);
    if (!it) return;
    const p = clientToFormat(svgRef.current!, e.clientX, e.clientY);
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 4 * px) return;
    g.moved = true;
    if (g.kind === 'move') {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      const box = { x: it.x + dx, y: it.y + dy, w: it.w, h: it.h };
      const snap = snapBox(box, anchors, format, MAGNET_PX * px);
      setLive({ ...NO_LIVE, id: it.id, dx: dx + (snap?.dx ?? 0), dy: dy + (snap?.dy ?? 0), snap });
    } else if (g.kind === 'scale') {
      const d = Math.hypot(p.x - g.pivot.x, p.y - g.pivot.y);
      const scale = Math.min(8, Math.max(0.1, d / Math.max(g.startDist, 1e-9)));
      setLive({ ...NO_LIVE, id: it.id, scale });
    } else {
      const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
      let r = g.baseRotation + ((Math.atan2(p.y - c.y, p.x - c.x) - g.startAngle) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      const step = Math.round(r / 15) * 15; // crans tous les 15°
      if (Math.abs(r - step) < 4) r = step;
      setLive({ ...NO_LIVE, id: it.id, rotation: Math.round(r) });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const it = g && items.find((i) => i.id === g.id);
    if (g?.moved && it && live) {
      if (g.kind === 'move') props.onMoveEnd(it.id, { x: it.x + live.dx, y: it.y + live.dy, w: it.w, h: it.h }, live.snap);
      if (g.kind === 'scale' && Math.abs(live.scale - 1) > 0.005) props.onScale(it.id, live.scale);
      if (g.kind === 'rotate' && live.rotation !== undefined) props.onRotate(it.id, live.rotation);
    }
    setLive(null);
  };

  const bg = resolveBackground(project, palette);
  const bgSelected = selectedId === BACKGROUND_ID;
  const dragging = live !== null && gesture.current?.kind === 'move';
  const lit = highlightAnchors || dragging;
  const target = live?.snap ? { x: live.snap.anchor.x, y: live.snap.anchor.y } : props.ghostTarget;

  const selected = items.find((it) => it.id === selectedId);
  const sel = selected && selectionGeometry(selected, live?.id === selected.id ? live : null, px);

  // barre d'actions au-dessus de la sélection (en pixels, relative à la surface)
  let toolbar: Pt | null = null;
  const svg = svgRef.current;
  if (sel && !live && svg) {
    const ctm = svg.getScreenCTM();
    const rect = svg.getBoundingClientRect();
    if (ctm) {
      const top = Math.min(...sel.corners.map((c) => c.y), sel.rotHandle.y);
      const bottom = Math.max(...sel.corners.map((c) => c.y));
      const cx = sel.corners.reduce((s, c) => s + c.x, 0) / 4;
      const toScreen = (x: number, y: number) => ({ x: ctm.a * x + ctm.e - rect.left, y: ctm.d * y + ctm.f - rect.top });
      const above = toScreen(cx, top);
      toolbar = above.y > 70 ? { x: above.x, y: above.y - 12 } : { ...toScreen(cx, bottom), y: toScreen(cx, bottom).y + 56 };
      toolbar.x = Math.min(Math.max(toolbar.x, 130), rect.width - 130);
    }
  }

  return (
    <>
      <svg
        ref={svgRef}
        className={dragging ? 'workspace-svg dragging' : 'workspace-svg'}
        viewBox={`${-W * 0.04} ${-H * 0.04} ${W * 1.08} ${H * 1.08}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={() => props.onSelect(null)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <clipPath id="format-clip">
            <rect width={W} height={H} />
          </clipPath>
          <filter id="page-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy={px * 2} stdDeviation={px * 6} floodOpacity="0.18" />
          </filter>
        </defs>
        <rect
          width={W}
          height={H}
          fill={bg}
          filter="url(#page-shadow)"
          className="page"
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onSelect(BACKGROUND_ID);
          }}
        />
        <g clipPath="url(#format-clip)">
          {project.globals.map((g, i) => {
            const el = library.get(g.ref);
            if (el?.type !== 'image') return null;
            return (
              <image
                key={i}
                href={fileUrl(el.source)}
                width={W}
                height={H}
                opacity={globalOpacity(g.deltas)}
                pointerEvents="none"
                preserveAspectRatio={g.fit === 'contain' ? 'xMidYMid meet' : g.fit === 'stretch' ? 'none' : 'xMidYMid slice'}
              />
            );
          })}
          {items.map((it) => {
            const l = live?.id === it.id ? live : NO_LIVE;
            const cx = it.x + it.w / 2;
            const cy = it.y + it.h / 2;
            const pv = pivotOf(it);
            return (
              <g
                key={it.id}
                className={it.id === selectedId ? 'ws-item selected' : 'ws-item'}
                transform={`translate(${l.dx} ${l.dy}) translate(${pv.x} ${pv.y}) scale(${l.scale}) translate(${-pv.x} ${-pv.y}) rotate(${l.rotation ?? it.rotation} ${cx} ${cy})`}
                opacity={it.opacity}
                onPointerDown={(e) => begin(e, it, 'move')}
              >
                {renderItem(it)}
                <rect className="hit" x={it.x} y={it.y} width={it.w} height={it.h} fill="transparent" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </g>
        {showGuides && (
          <g pointerEvents="none">
            {guides.map((l, i) => {
              const s = STROKE[l.weight];
              return (
                <line
                  key={i}
                  x1={l.x1 * W}
                  y1={l.y1 * H}
                  x2={l.x2 * W}
                  y2={l.y2 * H}
                  stroke={s.color}
                  strokeWidth={s.w * px}
                  strokeDasharray={s.dash?.split(' ').map((n) => Number(n) * px).join(' ')}
                />
              );
            })}
          </g>
        )}
        {(lit || showGuides) && (
          <g pointerEvents="none" className={lit ? 'anchors lit' : 'anchors'}>
            {anchors.map((a) => (
              <circle key={a.id} cx={a.x * W} cy={a.y * H} r={(lit ? 4.5 : 3) * px} className="anchor" />
            ))}
          </g>
        )}
        {target && (
          <g pointerEvents="none" className="magnet">
            <circle cx={target.x * W} cy={target.y * H} r={MAGNET_PX * px} className="magnet-zone" />
            <circle cx={target.x * W} cy={target.y * H} r={9 * px} className="magnet-ring" strokeWidth={2.5 * px} />
          </g>
        )}
        {bgSelected && <rect width={W} height={H} className="sel-outline" strokeWidth={3 * px} pointerEvents="none" />}
        {sel && selected && (
          <g className="selection">
            <polygon points={sel.corners.map((c) => `${c.x},${c.y}`).join(' ')} className="sel-outline" strokeWidth={1.5 * px} />
            {!dragging && (
              <>
                <line x1={sel.topMid.x} y1={sel.topMid.y} x2={sel.rotHandle.x} y2={sel.rotHandle.y} className="sel-outline" strokeWidth={1.5 * px} />
                <Handle at={sel.rotHandle} px={px} rotate onDown={(e) => begin(e, selected, 'rotate')} />
                {sel.corners.map((c, i) =>
                  CORNERS[i] === selected.align ? null : <Handle key={i} at={c} px={px} onDown={(e) => begin(e, selected, 'scale')} />,
                )}
              </>
            )}
            {/* point de l'élément posé sur l'ancrage */}
            <circle cx={sel.pivot.x} cy={sel.pivot.y} r={5 * px} className="sel-pivot" strokeWidth={2 * px} pointerEvents="none" />
          </g>
        )}
      </svg>
      {toolbar && selected && (
        <div className="sel-toolbar glass" style={{ left: toolbar.x, top: toolbar.y }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => props.onDuplicate(selected.id)} title="Dupliquer">⧉ <span>Dupliquer</span></button>
          <button onClick={() => props.onLayer(selected.id, 1)} title="Avancer d'un plan">⬆ <span>Avancer</span></button>
          <button onClick={() => props.onLayer(selected.id, -1)} title="Reculer d'un plan">⬇ <span>Reculer</span></button>
          <button className="danger" onClick={() => props.onDelete(selected.id)} title="Supprimer (touche Suppr)">🗑 <span>Supprimer</span></button>
        </div>
      )}
    </>
  );
}

function selectionGeometry(it: LayoutItem, l: Live | null, px: number) {
  const rotation = l?.rotation ?? it.rotation;
  const scale = l?.scale ?? 1;
  const dx = l?.dx ?? 0;
  const dy = l?.dy ?? 0;
  const pivot = alignPoint(it, it.align);
  const at = (a: Align) => place(alignPoint(it, a), it, rotation, pivot, scale, dx, dy);
  const corners = CORNERS.map(at);
  const topMid = at('top');
  const center = at('center');
  // poignée de rotation : au-dessus du bord haut, dans l'axe de l'élément
  const ux = topMid.x - center.x;
  const uy = topMid.y - center.y;
  const n = Math.hypot(ux, uy) || 1;
  const rotHandle = { x: topMid.x + (ux / n) * 32 * px, y: topMid.y + (uy / n) * 32 * px };
  return { corners, topMid, rotHandle, pivot: { x: pivot.x + dx, y: pivot.y + dy } };
}

function Handle({ at, px, rotate, onDown }: { at: Pt; px: number; rotate?: boolean; onDown: (e: React.PointerEvent) => void }) {
  return (
    <g className={rotate ? 'handle rotate' : 'handle'} onPointerDown={onDown}>
      <circle cx={at.x} cy={at.y} r={22 * px} fill="transparent" />
      <circle cx={at.x} cy={at.y} r={(rotate ? 8 : 7) * px} className="handle-dot" strokeWidth={2 * px} />
    </g>
  );
}

function renderItem(it: LayoutItem) {
  if (it.kind === 'image') {
    const par = it.fit === 'cover' ? 'xMidYMid slice' : it.fit === 'stretch' ? 'none' : 'xMidYMid meet';
    return <image href={it.href} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio={par} />;
  }
  if (it.kind === 'text') {
    const anchor = it.textAlign ?? 'middle';
    const tx = anchor === 'start' ? it.x : anchor === 'end' ? it.x + it.w : it.x + it.w / 2;
    const lines = (it.text ?? '').split('\n');
    return (
      <text
        x={tx}
        y={it.y}
        fontSize={it.fontSize}
        fontFamily={it.fontFamily ?? 'var(--font-display)'}
        fontWeight={it.fontWeight}
        fill={it.color}
        textAnchor={anchor}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={tx} dy={i === 0 ? '0.95em' : '1.2em'}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }
  return (
    <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="none" stroke="#c33" strokeDasharray="4 4">
      <title>Élément introuvable : {it.ref}</title>
    </rect>
  );
}
