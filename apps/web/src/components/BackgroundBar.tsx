import { deltaSpec, type LibraryElement, type Project } from '@ftd/core';
import { useState } from 'react';
import { DeltaSlider } from './AttributeBar';

interface Props {
  project: Project;
  library: Map<string, LibraryElement>;
  onColor: () => void;
  onDelta: (key: string, value: number) => void;
  onLayerDelta: (index: number, key: string, value: number) => void;
  onRemoveLayer: (index: number) => void;
}

const COLOR_KEYS = ['color.hue', 'color.lightness', 'color.chroma'];

/**
 * Le fond est un élément fixe : on ne le déplace pas, mais on règle sa couleur,
 * ses deltas, et les images attachées au document entier.
 */
export function BackgroundBar({ project, library, onColor, onDelta, onLayerDelta, onRemoveLayer }: Props) {
  // cible : 'color.*' pour le fond, 'layer:<i>' pour l'opacité d'une image de fond
  const [active, setActive] = useState<string>('color.lightness');
  const layer = active.startsWith('layer:') ? Number(active.slice(6)) : null;
  const spec = deltaSpec(layer !== null ? 'opacity' : active)!;
  const value = layer !== null ? (project.globals[layer]?.deltas.opacity ?? 0) : (project.backgroundDeltas[active] ?? 0);

  return (
    <div className="attr-bar glass">
      <div className="attr-chips">
        <span className="attr-title">Fond</span>
        <button className="chip" onClick={onColor}>
          Couleur
        </button>
        {COLOR_KEYS.map((k) => (
          <button
            key={k}
            className={`chip ${active === k ? 'on' : ''} ${project.backgroundDeltas[k] ? 'changed' : ''}`}
            onClick={() => setActive(k)}
          >
            {deltaSpec(k)!.label}
          </button>
        ))}
        {project.globals.map((g, i) => {
          const el = library.get(g.ref);
          return (
            <span key={i} className={`chip layer ${active === `layer:${i}` ? 'on' : ''}`}>
              <button onClick={() => setActive(`layer:${i}`)}>Image « {el?.title ?? g.ref} »</button>
              <button
                className="layer-x"
                aria-label="Retirer l'image du fond"
                onClick={() => {
                  setActive('color.lightness');
                  onRemoveLayer(i);
                }}
              >
                ✕
              </button>
            </span>
          );
        })}
        <button className="chip" disabled title="Arrive avec les shaders GLSL (phase 2)">
          Effets
        </button>
      </div>
      <DeltaSlider spec={spec} value={value} onChange={(v) => (layer !== null ? onLayerDelta(layer, 'opacity', v) : onDelta(active, v))} />
      {!project.globals.length && <p className="hint">Glisse une image hors du format pour l'attacher au fond.</p>}
    </div>
  );
}
