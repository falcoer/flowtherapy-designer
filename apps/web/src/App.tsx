import {
  anchorsFor,
  computeLayout,
  effectiveElement,
  libraryKey,
  nearestAnchor,
  toYaml,
  type AnchorFrame,
  type Format,
  type LibraryElement,
  type PaletteElement,
  type Placed,
  type Project,
} from '@ftd/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fileUrl } from './api';
import { AttributeBar } from './components/AttributeBar';
import { InsertPanel, Preview } from './components/InsertPanel';
import { PalettePanel } from './components/PalettePanel';
import { Workspace, clientToFormat } from './components/Workspace';

type Ghost = { el: LibraryElement; x: number; y: number };

export function App() {
  const [formats, setFormats] = useState<Format[]>([]);
  const [library, setLibrary] = useState<LibraryElement[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formatId, setFormatId] = useState<string>('');
  const [frame, setFrame] = useState<AnchorFrame>('repartition');
  const [showGuides, setShowGuides] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDelta, setActiveDelta] = useState<string | null>('size');
  const [insertOpen, setInsertOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    (async () => {
      const [f, l, list] = await Promise.all([api.formats(), api.library(), api.projects()]);
      setFormats(f);
      setLibrary(l);
      if (list[0]) {
        const { project: p } = await api.project(list[0].id);
        setProject(p);
        setFormatId(p.formats[0]!);
      }
    })().catch((e) => setToast(`Chargement impossible : ${e.message}`));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const libMap = useMemo(() => new Map(library.map((el) => [libraryKey(el), el])), [library]);
  const format = formats.find((f) => f.id === formatId);
  const items = useMemo(() => {
    if (!project || !format) return [];
    try {
      return computeLayout(project, format.id, { formats, library: libMap, fileUrl });
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [project, format, formats, libMap]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return library.filter((el) => {
      if (type && el.type !== type) return false;
      if (!q) return true;
      return [el.id, el.title ?? '', ...el.tags, el.type === 'text' ? el.body : ''].join(' ').toLowerCase().includes(q);
    });
  }, [library, query, type]);

  const update = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => (p ? fn(structuredClone(p)) : p));
    setDirty(true);
  }, []);

  /**
   * Modifie un élément. Sur le format principal (le premier), on change
   * l'élément lui-même ; sur les autres, on écrit un override propre au format.
   */
  const patchElement = useCallback(
    (id: string, patch: (el: Placed) => Partial<Placed>) => {
      update((p) => {
        const base = p.elements.find((e) => e.id === id);
        if (!base) return p;
        if (formatId === p.formats[0]) {
          Object.assign(base, patch(base));
        } else {
          const current = effectiveElement(p, formatId, base);
          const o = ((p.overrides[formatId] ??= {})[id] ??= {});
          Object.assign(o, patch(current));
        }
        return p;
      });
    },
    [update, formatId],
  );

  const onMoveEnd = (id: string, nx: number, ny: number) => {
    if (!format) return;
    const a = nearestAnchor(anchorsFor(frame, format), nx, ny, format);
    patchElement(id, (el) => {
      const { dx: _dx, dy: _dy, ...deltas } = el.deltas;
      return { anchor: { frame, point: a.id }, deltas };
    });
  };

  // glisser depuis la bibliothèque, suivi au niveau de la fenêtre (tactile compris)
  useEffect(() => {
    if (!ghost) return;
    const move = (e: PointerEvent) => setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    const up = (e: PointerEvent) => {
      const g = ghost;
      setGhost(null);
      const svg = svgRef.current;
      if (!svg || !format || !project) return;
      const r = svg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const p = clientToFormat(svg, e.clientX, e.clientY);
      const nx = p.x / format.width;
      const ny = p.y / format.height;
      const inside = nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;
      const ref = libraryKey(g.el);
      if (!inside) {
        if (g.el.type === 'image') {
          update((pr) => ({ ...pr, globals: [...pr.globals, { ref, fit: 'cover', deltas: {} }] }));
          setToast('Image attachée au document entier');
        }
        return;
      }
      const a = nearestAnchor(anchorsFor(frame, format), nx, ny, format);
      const id = uniqueId(project, g.el.id);
      const el: Placed = {
        id,
        ref,
        anchor: { frame, point: a.id },
        align: 'center',
        size: g.el.type === 'text' ? { w: 0.8 } : { w: 0.4 },
        fit: 'contain',
        style: g.el.type === 'text' ? { size: 0.05, color: 'palette.texte' } : {},
        deltas: {},
      };
      update((pr) => ({ ...pr, elements: [...pr.elements, el] }));
      setSelectedId(id);
      setInsertOpen(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [ghost, format, project, frame, update]);

  const save = async () => {
    if (!project) return;
    try {
      await api.saveProject(project.id, toYaml(project));
      setDirty(false);
      setToast('Projet enregistré');
    } catch (e) {
      setToast(`Erreur : ${(e as Error).message}`);
    }
  };

  if (!project || !format) return <div className="loading">{toast ?? 'Chargement…'}</div>;

  const selected = project.elements.find((e) => e.id === selectedId);
  const selectedItem = items.find((i) => i.id === selectedId);
  const palette = project.palette ? (libMap.get(`palette/${project.palette}`) as PaletteElement | undefined) : undefined;
  const otherFormats = formats.filter((f) => !project.formats.includes(f.id));

  return (
    <div className="app">
      <main className="stage">
        <Workspace
          format={format}
          project={project}
          items={items}
          library={libMap}
          frame={frame}
          showGuides={showGuides}
          highlightAnchors={ghost !== null}
          selectedId={selectedId}
          svgRef={svgRef}
          onSelect={(id) => {
            setSelectedId(id);
            setPaletteOpen(false);
          }}
          onMoveEnd={onMoveEnd}
        />
      </main>

      <header className="top-bar glass">
        <strong className="project-title">{project.title ?? project.id}</strong>
        <nav className="formats">
          {project.formats.map((id) => (
            <button key={id} className={id === formatId ? 'chip on' : 'chip'} onClick={() => setFormatId(id)}>
              {formats.find((f) => f.id === id)?.title ?? id}
            </button>
          ))}
          {otherFormats.length > 0 && (
            <select
              className="chip"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                update((p) => ({ ...p, formats: [...p.formats, id] }));
                setFormatId(id);
              }}
            >
              <option value="">+ format</option>
              {otherFormats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          )}
        </nav>
        <div className="actions">
          <button className="chip" onClick={() => setYamlOpen(true)}>
            YAML
          </button>
          <button className={dirty ? 'chip primary' : 'chip'} onClick={save} disabled={!dirty}>
            {dirty ? 'Enregistrer' : 'Enregistré'}
          </button>
        </div>
      </header>

      <nav className="rail glass">
        <button className="rail-btn primary" onClick={() => setInsertOpen(true)} title="Insérer depuis la bibliothèque">
          ＋
        </button>
        <button
          className={frame === 'repartition' ? 'rail-btn on' : 'rail-btn'}
          onClick={() => setFrame('repartition')}
          title="Référentiel par répartition"
        >
          ⊕
        </button>
        <button className={frame === 'grid' ? 'rail-btn on' : 'rail-btn'} onClick={() => setFrame('grid')} title="Grille classique">
          ▦
        </button>
        <button className={showGuides ? 'rail-btn on' : 'rail-btn'} onClick={() => setShowGuides((v) => !v)} title="Afficher les repères">
          ⌗
        </button>
        {palette && (
          <button className={paletteOpen ? 'rail-btn on' : 'rail-btn'} onClick={() => setPaletteOpen((v) => !v)} title="Palette">
            <span className="rail-palette">
              {palette.colors.slice(0, 4).map((c, i) => (
                <i key={i} style={{ background: c.hex }} />
              ))}
            </span>
          </button>
        )}
      </nav>

      {paletteOpen && palette && (
        <div className="popover glass">
          <PalettePanel palette={palette} />
        </div>
      )}

      {selected && selectedItem && !insertOpen && (
        <AttributeBar
          element={effectiveElement(project, formatId, selected)}
          kind={selectedItem.kind}
          activeKey={activeDelta}
          onPick={setActiveDelta}
          onChange={(key, value) =>
            patchElement(selected.id, (el) => {
              const deltas = { ...el.deltas };
              if (value === 0) delete deltas[key];
              else deltas[key] = value;
              return { deltas };
            })
          }
          onRemove={() => {
            update((p) => ({
              ...p,
              elements: p.elements.filter((e) => e.id !== selected.id),
              overrides: Object.fromEntries(
                Object.entries(p.overrides).map(([f, o]) => [f, Object.fromEntries(Object.entries(o).filter(([k]) => k !== selected.id))]),
              ),
            }));
            setSelectedId(null);
          }}
        />
      )}

      {insertOpen && (
        <InsertPanel
          results={results}
          query={query}
          type={type}
          onQuery={setQuery}
          onType={setType}
          onClose={() => setInsertOpen(false)}
          onDragStart={(el, e) => {
            e.preventDefault();
            setGhost({ el, x: e.clientX, y: e.clientY });
          }}
          onApplyPalette={(id) => {
            update((p) => ({ ...p, palette: id }));
            setToast('Palette appliquée au projet');
          }}
        />
      )}

      {ghost && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y }}>
          <Preview el={ghost.el} />
        </div>
      )}

      {yamlOpen && (
        <div className="dialog-backdrop" onClick={() => setYamlOpen(false)}>
          <div className="dialog glass" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>Description du projet (YAML)</strong>
              <button className="icon-btn" onClick={() => setYamlOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </header>
            <pre>{toYaml(project)}</pre>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function uniqueId(project: Project, base: string): string {
  let id = base;
  let n = 2;
  while (project.elements.some((e) => e.id === id)) id = `${base}-${n++}`;
  return id;
}
