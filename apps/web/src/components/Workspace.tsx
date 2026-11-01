import {
  anchorsFor,
  guidesFor,
  resolveColor,
  type AnchorFrame,
  type Format,
  type GuideLine,
  type LayoutItem,
  type LibraryElement,
  type PaletteElement,
  type Project,
} from '@ftd/core';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { fileUrl } from '../api';

interface Props {
  format: Format;
  project: Project;
  items: LayoutItem[];
  library: Map<string, LibraryElement>;
  frame: AnchorFrame;
  showGuides: boolean;
  /** Ancrages allumés pendant un glisser (depuis la bibliothèque ou un élément). */
  highlightAnchors: boolean;
  selectedId: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
  onSelect: (id: string | null) => void;
  /** Fin de déplacement d'un élément : position normalisée de son point d'alignement. */
  onMoveEnd: (id: string, nx: number, ny: number) => void;
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

export function clientToFormat(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function Workspace(props: Props) {
  const { format, project, items, library, frame, showGuides, highlightAnchors, selectedId, svgRef } = props;
  const W = format.width;
  const H = format.height;
  const palette = project.palette ? (library.get(`palette/${project.palette}`) as PaletteElement | undefined) : undefined;
  const guides = useMemo(() => guidesFor(frame, format), [frame, format]);
  const anchors = useMemo(() => anchorsFor(frame, format), [frame, format]);
  const drag = useRef<{ id: string; startX: number; startY: number } | null>(null);
  const [offset, setOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);

  // trait constant à l'écran quel que soit le format (mm ou px)
  const unit = Math.max(W, H) / 800;

  const onPointerDown = (e: React.PointerEvent, item: LayoutItem) => {
    e.stopPropagation();
    props.onSelect(item.id);
    const p = clientToFormat(svgRef.current!, e.clientX, e.clientY);
    drag.current = { id: item.id, startX: p.x, startY: p.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = clientToFormat(svgRef.current!, e.clientX, e.clientY);
    setOffset({ id: drag.current.id, dx: p.x - drag.current.startX, dy: p.y - drag.current.startY });
  };
  const onPointerUp = (item: LayoutItem) => {
    if (drag.current && offset && (Math.abs(offset.dx) > unit || Math.abs(offset.dy) > unit)) {
      const ax = item.anchor.x * W + offset.dx;
      const ay = item.anchor.y * H + offset.dy;
      props.onMoveEnd(item.id, ax / W, ay / H);
    }
    drag.current = null;
    setOffset(null);
  };

  const bg = resolveColor(project.background, palette, '#ffffff');
  const lit = highlightAnchors || offset !== null;

  return (
    <svg
      ref={svgRef}
      className="workspace-svg"
      viewBox={`${-W * 0.04} ${-H * 0.04} ${W * 1.08} ${H * 1.08}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={() => props.onSelect(null)}
    >
      <defs>
        <clipPath id="format-clip">
          <rect width={W} height={H} />
        </clipPath>
        <filter id="page-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy={unit * 2} stdDeviation={unit * 6} floodOpacity="0.18" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={bg} filter="url(#page-shadow)" />
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
              preserveAspectRatio={g.fit === 'contain' ? 'xMidYMid meet' : g.fit === 'stretch' ? 'none' : 'xMidYMid slice'}
            />
          );
        })}
        {items.map((it) => {
          const o = offset?.id === it.id ? offset : { dx: 0, dy: 0 };
          const cx = it.x + it.w / 2;
          const cy = it.y + it.h / 2;
          return (
            <g
              key={it.id}
              className="ws-item"
              transform={`translate(${o.dx} ${o.dy}) rotate(${it.rotation} ${cx} ${cy})`}
              opacity={it.opacity}
              onPointerDown={(e) => onPointerDown(e, it)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(it)}
              onPointerCancel={() => onPointerUp(it)}
            >
              {renderItem(it)}
              <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="transparent" />
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
                strokeWidth={s.w * unit}
                strokeDasharray={s.dash?.split(' ').map((n) => Number(n) * unit).join(' ')}
              />
            );
          })}
        </g>
      )}
      {(lit || showGuides) && (
        <g pointerEvents="none" className={lit ? 'anchors lit' : 'anchors'}>
          {anchors.map((a) => (
            <circle
              key={a.id}
              cx={a.x * W}
              cy={a.y * H}
              r={3 * unit}
              className="anchor"
            />
          ))}
        </g>
      )}
      {items
        .filter((it) => it.id === selectedId)
        .map((it) => {
          const o = offset?.id === it.id ? offset : { dx: 0, dy: 0 };
          return (
            <g key="sel" pointerEvents="none">
              <rect
                transform={`rotate(${it.rotation} ${it.x + it.w / 2 + o.dx} ${it.y + it.h / 2 + o.dy})`}
                x={it.x + o.dx}
                y={it.y + o.dy}
                width={it.w}
                height={it.h}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5 * unit}
                strokeDasharray={`${4 * unit} ${3 * unit}`}
              />
              <circle cx={it.anchor.x * W} cy={it.anchor.y * H} r={5 * unit} fill="var(--accent)" />
            </g>
          );
        })}
    </svg>
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
