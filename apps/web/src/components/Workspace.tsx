import {
  gradientSpec,
  shapeGeometry,
  type Gradient,
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { fileUrl } from '../api';
import { BackIcon, DropIcon, DuplicateIcon, FrontIcon, StyleIcon, TrashIcon } from './Icons';

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
  onColor: (id: string) => void;
  onStyle: (id: string) => void;
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

/** Rayon du menu en arc, en pixels. */
const ARC_R = 92;

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
  /** Rotation tombée sur un cran (affichée en couleur). */
  rotationSnapped?: boolean;
  snap: Snap | null;
  /** Point d'ancrage qui attire le coin pendant un redimensionnement (unités du format). */
  magnet?: Pt;
  /** Position de l'étiquette (taille, angle). */
  label?: { at: Pt; text: string; snapped: boolean };
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
  // menu en arc : ouvert par appui long, clic droit ou bouton du stylet
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const press = useRef<number | null>(null);
  const cancelPress = () => {
    if (press.current !== null) clearTimeout(press.current);
    press.current = null;
  };
  const openMenu = (id: string, clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    cancelPress();
    gesture.current = null;
    setLive(null);
    setMenu({ id, x: clientX - r.left, y: clientY - r.top });
  };
  useEffect(() => {
    if (menu && menu.id !== selectedId) setMenu(null);
  }, [selectedId, menu]);
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
    setMenu(null);
    // clic droit, ou bouton latéral d'un stylet
    if (e.button === 2 || (e.pointerType === 'pen' && (e.buttons & 2) !== 0)) {
      openMenu(it.id, e.clientX, e.clientY);
      return;
    }
    if (kind === 'move') {
      const { clientX, clientY } = e;
      cancelPress();
      press.current = window.setTimeout(() => {
        if (gesture.current && !gesture.current.moved) openMenu(it.id, clientX, clientY);
      }, 480);
    }
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
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 6 * px) return;
    g.moved = true;
    cancelPress();
    if (g.kind === 'move') {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      const box = { x: it.x + dx, y: it.y + dy, w: it.w, h: it.h };
      const snap = snapBox(box, anchors, format, MAGNET_PX * px);
      setLive({ ...NO_LIVE, id: it.id, dx: dx + (snap?.dx ?? 0), dy: dy + (snap?.dy ?? 0), snap });
    } else if (g.kind === 'scale') {
      const d = Math.hypot(p.x - g.pivot.x, p.y - g.pivot.y);
      let scale = Math.min(8, Math.max(0.1, d / Math.max(g.startDist, 1e-9)));
      // le coin tiré est attiré par le point d'ancrage le plus proche
      const corner = { x: g.pivot.x + (g.start.x - g.pivot.x) * scale, y: g.pivot.y + (g.start.y - g.pivot.y) * scale };
      let magnet: Pt | undefined;
      let best = MAGNET_PX * px;
      for (const a of anchors) {
        const ax = a.x * W;
        const ay = a.y * H;
        const dist = Math.hypot(ax - corner.x, ay - corner.y);
        if (dist < best) {
          best = dist;
          magnet = { x: ax, y: ay };
        }
      }
      if (magnet) scale = Math.hypot(magnet.x - g.pivot.x, magnet.y - g.pivot.y) / Math.max(g.startDist, 1e-9);
      // sinon, crans doux sur ×1 et les moitiés
      else if (Math.abs(scale - Math.round(scale * 2) / 2) < 0.04) scale = Math.round(scale * 2) / 2;
      const tip = { x: g.pivot.x + (g.start.x - g.pivot.x) * scale, y: g.pivot.y + (g.start.y - g.pivot.y) * scale };
      setLive({
        ...NO_LIVE,
        id: it.id,
        scale,
        magnet,
        label: { at: tip, text: `×${scale.toFixed(2)}`, snapped: !!magnet || Math.abs(scale * 2 - Math.round(scale * 2)) < 1e-6 },
      });
    } else {
      const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
      let r = g.baseRotation + ((Math.atan2(p.y - c.y, p.x - c.x) - g.startAngle) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      const step = Math.round(r / 15) * 15; // crans tous les 15°
      const snapped = Math.abs(r - step) < 4;
      if (snapped) r = step;
      r = Math.round(r);
      setLive({ ...NO_LIVE, id: it.id, rotation: r, rotationSnapped: snapped, label: { at: p, text: `${r}°`, snapped } });
    }
  };

  const onPointerUp = () => {
    cancelPress();
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

  // menu en arc autour du point d'appui (en pixels, relatif à la surface)
  let arc: { x: number; y: number; below: boolean } | null = null;
  const svg = svgRef.current;
  if (menu && selected && menu.id === selected.id && !live && svg) {
    const rect = svg.getBoundingClientRect();
    const below = menu.y < ARC_R + 30;
    arc = { x: Math.min(Math.max(menu.x, ARC_R + 30), rect.width - ARC_R - 30), y: menu.y + (below ? 16 : -16), below };
  }
  const actions = selected
    ? [
        { key: 'dup', title: 'Dupliquer', icon: <DuplicateIcon />, run: () => props.onDuplicate(selected.id) },
        ...(selected.kind === 'text' || selected.kind === 'shape'
          ? [{ key: 'color', title: 'Couleur', icon: <DropIcon />, run: () => props.onColor(selected.id) }]
          : []),
        { key: 'style', title: selected.kind === 'text' ? 'Police et style' : 'Style', icon: <StyleIcon />, run: () => props.onStyle(selected.id) },
        { key: 'front', title: "Avancer d'un plan", icon: <FrontIcon />, run: () => props.onLayer(selected.id, 1) },
        { key: 'back', title: "Reculer d'un plan", icon: <BackIcon />, run: () => props.onLayer(selected.id, -1) },
        { key: 'del', title: 'Supprimer (touche Suppr)', icon: <TrashIcon />, run: () => props.onDelete(selected.id), danger: true },
      ]
    : [];

  return (
    <>
      <svg
        ref={svgRef}
        className={dragging ? 'workspace-svg dragging' : 'workspace-svg'}
        viewBox={`${-W * 0.04} ${-H * 0.04} ${W * 1.08} ${H * 1.08}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={() => {
          setMenu(null);
          props.onSelect(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {project.backgroundGradient && <GradientDef id="bg-gradient" gradient={project.backgroundGradient} />}
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
          fill={project.backgroundGradient ? 'url(#bg-gradient)' : bg}
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
        {live?.magnet && (
          <g pointerEvents="none" className="magnet">
            <circle cx={live.magnet.x} cy={live.magnet.y} r={MAGNET_PX * px} className="magnet-zone" />
            <circle cx={live.magnet.x} cy={live.magnet.y} r={9 * px} className="magnet-ring" strokeWidth={2.5 * px} />
          </g>
        )}
        {selected && live?.id === selected.id && live.rotation !== undefined && (
          <RotationDial item={selected} rotation={live.rotation} snapped={!!live.rotationSnapped} px={px} />
        )}
        {live?.label && (
          <g pointerEvents="none" transform={`translate(${live.label.at.x} ${live.label.at.y - 26 * px})`}>
            <rect x={-30 * px} y={-12 * px} width={60 * px} height={24 * px} rx={12 * px} className={live.label.snapped ? 'live-label snapped' : 'live-label'} />
            <text textAnchor="middle" dy="0.35em" fontSize={13 * px} className="live-label-text">
              {live.label.text}
            </text>
          </g>
        )}
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
      {arc && selected && (
        <div className="arc-menu" style={{ left: arc.x, top: arc.y }} onPointerDown={(e) => e.stopPropagation()}>
          {actions.map((a, i) => {
            // éventail de 140° centré au-dessus (ou au-dessous) de la sélection
            const n = actions.length;
            const deg = (n === 1 ? 0 : -70 + (140 * i) / (n - 1)) * (arc!.below ? -1 : 1);
            const r = (deg * Math.PI) / 180;
            const x = Math.sin(r) * ARC_R;
            const y = (arc!.below ? 1 : -1) * Math.cos(r) * ARC_R;
            return (
              <button
                key={a.key}
                className={`arc-btn glass ${'danger' in a && a.danger ? 'danger' : ''}`}
                style={{ transform: `translate(${x}px, ${y}px)`, transitionDelay: `${i * 18}ms` }}
                onClick={() => {
                  setMenu(null);
                  a.run();
                }}
                title={a.title}
                aria-label={a.title}
              >
                {a.icon}
              </button>
            );
          })}
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

/** Cadran de rotation : crans tous les 15°, l'angle courant en couleur. */
function RotationDial({ item, rotation, snapped, px }: { item: LayoutItem; rotation: number; snapped: boolean; px: number }) {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const R = Math.max(item.w, item.h) / 2 + 40 * px;
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);
  const at = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };
  const end = at(rotation, R);
  return (
    <g pointerEvents="none" className="rot-dial">
      <circle cx={cx} cy={cy} r={R} className="rot-ring" strokeWidth={1.2 * px} />
      {ticks.map((t) => {
        const a = at(t, R - (t % 90 === 0 ? 12 : 6) * px);
        const b = at(t, R);
        return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={t % 90 === 0 ? 'rot-tick major' : 'rot-tick'} strokeWidth={(t % 90 === 0 ? 2 : 1.2) * px} />;
      })}
      <line x1={cx} y1={cy} x2={end.x} y2={end.y} className={snapped ? 'rot-hand snapped' : 'rot-hand'} strokeWidth={2 * px} />
      <circle cx={end.x} cy={end.y} r={(snapped ? 7 : 5) * px} className={snapped ? 'rot-tip snapped' : 'rot-tip'} />
    </g>
  );
}

function Handle({ at, px, rotate, onDown }: { at: Pt; px: number; rotate?: boolean; onDown: (e: React.PointerEvent) => void }) {
  return (
    <g className={rotate ? 'handle rotate' : 'handle'} onPointerDown={onDown}>
      <circle cx={at.x} cy={at.y} r={22 * px} fill="transparent" />
      <circle cx={at.x} cy={at.y} r={(rotate ? 8 : 7) * px} className="handle-dot" strokeWidth={2 * px} />
    </g>
  );
}

/** Définition d'un dégradé SVG (même géométrie que l'export). */
export function GradientDef({ id, gradient }: { id: string; gradient: Gradient }) {
  const s = gradientSpec(gradient);
  const Tag = s.tag;
  return (
    <Tag id={id} {...s.attrs}>
      {s.stops.map((st, i) => (
        <stop key={i} offset={st.offset} stopColor={st.color} />
      ))}
    </Tag>
  );
}

function renderItem(it: LayoutItem) {
  const fill = it.gradient ? `url(#g-${it.id})` : it.color;
  const defs = it.gradient ? (
    <defs>
      <GradientDef id={`g-${it.id}`} gradient={it.gradient} />
    </defs>
  ) : null;
  if (it.kind === 'shape' && it.shape) {
    const g = shapeGeometry(it.shape, it.x, it.y, it.w, it.h, it.radius ?? 0);
    const Tag = g.tag;
    return (
      <>
        {defs}
        <Tag {...g.attrs} fill={fill} />
      </>
    );
  }
  if (it.kind === 'image') {
    const par = it.fit === 'cover' ? 'xMidYMid slice' : it.fit === 'stretch' ? 'none' : 'xMidYMid meet';
    return <image href={it.href} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio={par} />;
  }
  if (it.kind === 'text') {
    const anchor = it.textAlign ?? 'middle';
    const tx = anchor === 'start' ? it.x : anchor === 'end' ? it.x + it.w : it.x + it.w / 2;
    const lines = (it.text ?? '').split('\n');
    return (
      <>
      {defs}
      <text
        x={tx}
        y={it.y}
        fontSize={it.fontSize}
        fontFamily={it.fontFamily ?? 'var(--font-display)'}
        fontWeight={it.fontWeight}
        fill={fill}
        textAnchor={anchor}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={tx} dy={i === 0 ? '0.95em' : '1.2em'}>
            {line}
          </tspan>
        ))}
      </text>
      </>
    );
  }
  return (
    <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="none" stroke="#c33" strokeDasharray="4 4">
      <title>Élément introuvable : {it.ref}</title>
    </rect>
  );
}
