import {
  alignPoint,
  anchorsFor,
  clampDelta,
  type Box,
  type Snap,
  computeLayout,
  effectiveElement,
  FRAME_TITLES,
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
import { api, exportUrl, fileUrl } from './api';
import { DEMO } from './demo';
import { AttributeBar } from './components/AttributeBar';
import { InsertPanel, Preview } from './components/InsertPanel';
import { PalettePanel } from './components/PalettePanel';
import { BackgroundBar } from './components/BackgroundBar';
import { BACKGROUND_ID, MAGNET_PX, Workspace, clientToFormat, formatPerPixel } from './components/Workspace';

const FRAME_BUTTONS: Array<{ frame: AnchorFrame; icon: string }> = [
  { frame: 'repartition', icon: '⊕' },
  { frame: 'or', icon: 'φ' },
  { frame: 'armature', icon: '✕' },
  { frame: 'grid', icon: '▦' },
];

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
  const [me, setMe] = useState<{ email: string; name?: string } | null>(null);
  const [results, setResults] = useState<LibraryElement[]>([]);
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [activeTag, setActiveTag] = useState('');
  const [uploading, setUploading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [record, setRecord] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    (async () => {
      const [f, l, list, user] = await Promise.all([api.formats(), api.library(), api.projects(), api.me()]);
      setMe(user);
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

  // recherche côté serveur (index SQLite), légèrement différée pendant la frappe
  useEffect(() => {
    if (!insertOpen) return;
    const t = setTimeout(() => {
      api
        .library({ q: query, type, tags: activeTag })
        .then(setResults)
        .catch((e) => setToast(`Recherche impossible : ${e.message}`));
    }, 180);
    return () => clearTimeout(t);
  }, [insertOpen, query, type, activeTag, library]);

  useEffect(() => {
    if (insertOpen) api.tags().then(setTags).catch(() => undefined);
  }, [insertOpen, library]);

  // polices de la bibliothèque disponibles sur la surface de travail
  useEffect(() => {
    const css = library
      .flatMap((el) =>
        el.type === 'font'
          ? el.files.map((f) => `@font-face{font-family:"${el.family}";font-weight:${f.weight};font-style:${f.style};src:url("${fileUrl(f.path)}")}`)
          : [],
      )
      .join('\n');
    let tag = document.getElementById('library-fonts') as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'library-fonts';
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [library]);

  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      const { created } = await api.upload(files, activeTag ? { tags: activeTag } : {});
      setLibrary(await api.library());
      setToast(`${created.filter((c) => c.type !== 'palette').length} élément(s) importé(s)`);
    } catch (e) {
      setToast(`Import impossible : ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  // historique pour annuler / rétablir (l'état courant est aussi gardé dans une ref)
  const current = useRef<Project | null>(null);
  current.current = project;
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [, setHistoryTick] = useState(0);

  const update = useCallback((fn: (p: Project) => Project) => {
    const cur = current.current;
    if (!cur) return;
    const next = fn(structuredClone(cur));
    past.current = [...past.current.slice(-99), cur];
    future.current = [];
    current.current = next;
    setProject(next);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !current.current) return;
    future.current.push(current.current);
    current.current = prev;
    setProject(prev);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !current.current) return;
    past.current.push(current.current);
    current.current = next;
    setProject(next);
    setDirty(true);
    setHistoryTick((t) => t + 1);
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

  /**
   * Fin de déplacement. Accroché par l'aimant : le point de l'élément est posé
   * sur l'ancrage. Lâché librement : ancrage le plus proche + petit décalage.
   */
  const onMoveEnd = (id: string, box: Box, snap: Snap | null) => {
    if (!format) return;
    patchElement(id, (el) => {
      const { dx: _dx, dy: _dy, ...deltas } = el.deltas;
      if (snap) return { anchor: { frame, point: snap.anchor.id }, align: snap.align, deltas };
      const p = alignPoint(box, el.align);
      const a = nearestAnchor(anchorsFor(frame, format), p.x / format.width, p.y / format.height, format);
      const dx = clampDelta('dx', p.x / format.width - a.x);
      const dy = clampDelta('dy', p.y / format.height - a.y);
      if (Math.abs(dx) > 0.0005) deltas.dx = Math.round(dx * 1e4) / 1e4;
      if (Math.abs(dy) > 0.0005) deltas.dy = Math.round(dy * 1e4) / 1e4;
      return { anchor: { frame, point: a.id }, deltas };
    });
  };

  /** Poignée de taille : on agrandit la mesure de base, le delta de taille reste un réglage fin. */
  const onScale = (id: string, k: number) => {
    const r = (v: number) => Math.round(v * k * 1e4) / 1e4;
    patchElement(id, (el) => {
      const kind = libMap.get(el.ref)?.type;
      if (kind === 'text') return { size: { ...el.size, w: r(el.size.w ?? 0.8) }, style: { ...el.style, size: r(el.style.size ?? 0.06) } };
      const size = Object.fromEntries(Object.entries(el.size).map(([key, v]) => [key, r(v as number)]));
      if (!Object.keys(size).length) size.min = r(0.3);
      return { size };
    });
  };

  const onRotate = (id: string, deg: number) =>
    patchElement(id, (el) => {
      const deltas = { ...el.deltas };
      if (deg === 0) delete deltas.rotation;
      else deltas.rotation = deg;
      return { deltas };
    });

  const removeElement = (id: string) => {
    update((p) => ({
      ...p,
      elements: p.elements.filter((e) => e.id !== id),
      overrides: Object.fromEntries(
        Object.entries(p.overrides).map(([f, o]) => [f, Object.fromEntries(Object.entries(o).filter(([k]) => k !== id))]),
      ),
    }));
    setSelectedId(null);
    setToast('Élément supprimé (Annuler pour le récupérer)');
  };

  const duplicateElement = (id: string) => {
    if (!project) return;
    const src = project.elements.find((e) => e.id === id);
    if (!src) return;
    const copy: Placed = { ...structuredClone(src), id: uniqueId(project, src.id) };
    copy.deltas = { ...copy.deltas, dx: clampDelta('dx', (copy.deltas.dx ?? 0) + 0.03), dy: clampDelta('dy', (copy.deltas.dy ?? 0) + 0.03) };
    update((p) => ({ ...p, elements: [...p.elements, copy] }));
    setSelectedId(copy.id);
  };

  /** L'ordre de la liste est l'ordre d'empilement : le dernier est devant. */
  const moveLayer = (id: string, step: 1 | -1) => {
    if (!project) return;
    const i = project.elements.findIndex((e) => e.id === id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= project.elements.length) {
      setToast(step > 0 ? 'Déjà au premier plan' : "Déjà à l'arrière-plan");
      return;
    }
    update((p) => {
      const els = [...p.elements];
      [els[i], els[j]] = [els[j]!, els[i]!];
      return { ...p, elements: els };
    });
  };

  // clavier : Suppr, Échap, Cmd/Ctrl+Z, Cmd/Ctrl+Maj+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && selectedId !== BACKGROUND_ID) {
        e.preventDefault();
        removeElement(selectedId);
      } else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          setSelectedId(BACKGROUND_ID);
          setInsertOpen(false);
          setToast('Image attachée au fond');
        }
        return;
      }
      const target = ghostTargetAt(svg, format, frame, e.clientX, e.clientY);
      const a = target ?? nearestAnchor(anchorsFor(frame, format), nx, ny, format);
      const free: Record<string, number> = target ? {} : { dx: clampDelta('dx', nx - a.x), dy: clampDelta('dy', ny - a.y) };
      const id = uniqueId(project, g.el.id);
      const el: Placed = {
        id,
        ref,
        anchor: { frame, point: a.id },
        align: 'center',
        size: g.el.type === 'text' ? { w: 0.8 } : { w: 0.4 },
        fit: 'contain',
        style: g.el.type === 'text' ? { size: 0.05, color: 'palette.texte' } : {},
        deltas: free,
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

  const save = async (quiet = false) => {
    if (!project) return false;
    try {
      await api.saveProject(project.id, toYaml(project));
      setDirty(false);
      if (!quiet) setToast('Projet enregistré');
      return true;
    } catch (e) {
      setToast(`Erreur : ${(e as Error).message}`);
      return false;
    }
  };

  /** L'export lit le projet enregistré : on enregistre d'abord les changements. */
  const download = async (kind: 'png' | 'pdf' | 'svg') => {
    if (!project || !format) return;
    if (dirty && !(await save(true))) return;
    if (DEMO) {
      setExportOpen(false);
      setToast("Démo : l'export PNG/PDF/SVG fonctionnera sur designer.flowtherapymusic.com");
      return;
    }
    setToast('Export en cours…');
    const a = document.createElement('a');
    a.href = exportUrl(project.id, format.id, kind, record);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExportOpen(false);
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
          ghostTarget={ghost && svgRef.current ? ghostTargetAt(svgRef.current, format, frame, ghost.x, ghost.y) : null}
          selectedId={selectedId}
          svgRef={svgRef}
          onSelect={(id) => {
            setSelectedId(id);
          }}
          onMoveEnd={onMoveEnd}
          onScale={onScale}
          onRotate={onRotate}
          onDuplicate={duplicateElement}
          onLayer={moveLayer}
          onDelete={removeElement}
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
          <button className={exportOpen ? 'chip on' : 'chip'} onClick={() => setExportOpen((v) => !v)}>
            Exporter
          </button>
          <button className={dirty ? 'chip primary' : 'chip'} onClick={() => save()} disabled={!dirty}>
            {dirty ? 'Enregistrer' : 'Enregistré'}
          </button>
          {me && (
            <a className="avatar" href="/auth/logout" title={`${me.name ?? me.email} — se déconnecter`}>
              {(me.name ?? me.email).slice(0, 1).toUpperCase()}
            </a>
          )}
        </div>
      </header>

      <nav className="rail glass">
        <button className="rail-btn primary" onClick={() => setInsertOpen(true)} title="Insérer depuis la bibliothèque">
          ＋
        </button>
        {FRAME_BUTTONS.map((b) => (
          <button
            key={b.frame}
            className={frame === b.frame ? 'rail-btn on' : 'rail-btn'}
            onClick={() => setFrame(b.frame)}
            title={FRAME_TITLES[b.frame]}
          >
            {b.icon}
          </button>
        ))}
        <button className={showGuides ? 'rail-btn on' : 'rail-btn'} onClick={() => setShowGuides((v) => !v)} title="Afficher les repères">
          ⌗
        </button>
        {library.some((el) => el.type === 'palette') && (
          <button className={paletteOpen ? 'rail-btn on' : 'rail-btn'} onClick={() => setPaletteOpen((v) => !v)} title="Palette">
            <span className="rail-palette">
              {(palette?.colors ?? []).slice(0, 4).map((c, i) => (
                <i key={i} style={{ background: c.hex }} />
              ))}
            </span>
          </button>
        )}
        <span className="rail-sep" />
        <button className="rail-btn" onClick={undo} disabled={!past.current.length} title="Annuler (Cmd/Ctrl+Z)">
          ↶
        </button>
        <button className="rail-btn" onClick={redo} disabled={!future.current.length} title="Rétablir (Cmd/Ctrl+Maj+Z)">
          ↷
        </button>
      </nav>

      {exportOpen && (
        <div className="popover export-popover glass">
          <strong>Exporter « {format.title} »</strong>
          {(project.records?.length ?? 0) > 1 && (
            <label className="field">
              Ligne de la liste
              <select value={record} onChange={(e) => setRecord(Number(e.target.value))}>
                {project.records!.map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {Object.values(r).join(' · ')}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="export-buttons">
            <button className="chip" onClick={() => download('png')}>
              PNG
            </button>
            <button className="chip" onClick={() => download('pdf')}>
              PDF
            </button>
            <button className="chip" onClick={() => download('svg')}>
              SVG
            </button>
          </div>
          <p className="hint">
            {format.unit === 'mm' ? `Impression : ${format.dpi ?? 300} dpi, images originales.` : 'Écran : images optimisées pour le web.'}
          </p>
        </div>
      )}

      {paletteOpen && (
        <div className="popover glass">
          <PalettePanel
            palette={palette}
            palettes={library.filter((el): el is PaletteElement => el.type === 'palette')}
            textSelected={selectedItem?.kind === 'text' ? selectedItem.id : null}
            textColor={selected ? effectiveElement(project, formatId, selected).style.color : undefined}
            background={project.background}
            onPalette={(id) => update((p) => ({ ...p, palette: id }))}
            onTextColor={(color) => selected && patchElement(selected.id, (el) => ({ style: { ...el.style, color } }))}
            onBackground={(background) => update((p) => ({ ...p, background }))}
          />
        </div>
      )}

      {selectedId === BACKGROUND_ID && !insertOpen && (
        <BackgroundBar
          project={project}
          library={libMap}
          onColor={() => setPaletteOpen(true)}
          onDelta={(key, value) =>
            update((p) => {
              const d = { ...p.backgroundDeltas };
              if (value === 0) delete d[key];
              else d[key] = value;
              return { ...p, backgroundDeltas: d };
            })
          }
          onLayerDelta={(i, key, value) =>
            update((p) => {
              const g = p.globals[i];
              if (!g) return p;
              if (value === 0) delete g.deltas[key];
              else g.deltas[key] = value;
              return p;
            })
          }
          onRemoveLayer={(i) => update((p) => ({ ...p, globals: p.globals.filter((_, j) => j !== i) }))}
        />
      )}

      {selected && selectedItem && !insertOpen && (
        <AttributeBar
          element={effectiveElement(project, formatId, selected)}
          kind={selectedItem.kind}
          activeKey={activeDelta}
          fonts={library.flatMap((el) => (el.type === 'font' ? [{ id: el.id, family: el.family }] : []))}
          onFont={(font) => patchElement(selected.id, (el) => ({ style: { ...el.style, font: font || undefined } }))}
          onPick={setActiveDelta}
          onChange={(key, value) =>
            patchElement(selected.id, (el) => {
              const deltas = { ...el.deltas };
              if (value === 0) delete deltas[key];
              else deltas[key] = value;
              return { deltas };
            })
          }
          onRemove={() => removeElement(selected.id)}
          onColor={() => setPaletteOpen(true)}
        />
      )}

      {insertOpen && (
        <InsertPanel
          results={results}
          query={query}
          type={type}
          tags={tags}
          activeTag={activeTag}
          uploading={uploading}
          onQuery={setQuery}
          onType={setType}
          onTag={setActiveTag}
          onUpload={upload}
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

/** Ancrage attiré par le pointeur (glisser depuis la bibliothèque), s'il est assez proche. */
function ghostTargetAt(svg: SVGSVGElement, format: Format, frame: AnchorFrame, clientX: number, clientY: number) {
  const p = clientToFormat(svg, clientX, clientY);
  const radius = MAGNET_PX * formatPerPixel(svg);
  const a = nearestAnchor(anchorsFor(frame, format), p.x / format.width, p.y / format.height, format);
  return Math.hypot(a.x * format.width - p.x, a.y * format.height - p.y) <= radius ? a : null;
}

function uniqueId(project: Project, base: string): string {
  let id = base;
  let n = 2;
  while (project.elements.some((e) => e.id === id)) id = `${base}-${n++}`;
  return id;
}
