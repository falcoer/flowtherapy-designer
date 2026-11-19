import { describe, expect, it } from 'vitest';
import { newRig, rigJoints, RIG_BONES } from '../src/anim';
import { rig } from '../src/stickers/rig';
import type { Anim, Bone, Context } from '../src/stickers/kit';
import { withSilhouettes } from '../src/charkit';
import { jointsText, templateJoints } from '../src/stickers';
import type { Layer } from '../src/model';

/** Un objet habillé dans une vue, en train de marcher sur place (boucle `turns` faite sur 4). */
const walking = (view: string, turns: number) => {
  const a: Anim = { ...newRig(0.66667), view };
  const ctx: Context = { each: (id) => (id === 'walk' ? [{ act: { id: 'w', g: 'walk', at: 0, len: 1 }, u: turns / 4, turns, of: 4, a }] : []) };
  return { a, bones: rig.skeleton!(a, 0, () => 0, ctx) as Bone[] };
};
const len = ([[x0, y0], [x1, y1]]: Bone, r = 0.66667) => Math.hypot((x1 - x0) * r, y1 - y0);
const restBones = (a: Anim): Bone[] => {
  const J = rigJoints(a);
  const IX = (k: string) => ['head', 'neck', 'pelvis', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'hipL', 'kneeL', 'footL', 'hipR', 'kneeR', 'footR'].indexOf(k);
  return RIG_BONES.map(([p, c]) => [J[IX(p)]!, J[IX(c)]!] as Bone);
};
// cuisse et tibia de la jambe gauche de l'image (genou levé au quart de boucle)
const [THIGH, SHIN] = [10, 11];

describe('marche d’un objet habillé : l’image ne s’écrase pas', () => {
  it('de face, la jambe levée garde sa longueur et le pied monte', () => {
    const { a, bones } = walking('face', 1.25);
    const rest = restBones(a);
    bones.forEach((b, i) => expect(len(b)).toBeCloseTo(len(rest[i]!), 3));
    // le pied levé est plus haut qu'au repos
    expect(bones[SHIN]![1][1]).toBeLessThan(rest[SHIN]![1][1] - 0.02);
  });
  it('de profil, le genou monte vers l’avant (la droite), sans raccourcir la jambe', () => {
    const { a, bones } = walking('profil', 1.25);
    const rest = restBones(a);
    bones.forEach((b, i) => expect(len(b)).toBeCloseTo(len(rest[i]!), 3));
    expect(bones[THIGH]![1][0]).toBeGreaterThan(rest[THIGH]![1][0] + 0.05);
    expect(bones[SHIN]![1][1]).toBeLessThan(rest[SHIN]![1][1] - 0.02);
  });
  it('tourné vers la gauche, le genou monte vers la gauche', () => {
    const { a, bones } = walking('profil-gauche', 1.25);
    const rest = restBones(a);
    expect(bones[THIGH]![1][0]).toBeLessThan(rest[THIGH]![1][0] - 0.05);
  });
  it('de trois-quarts dos, la marche tourne les membres au lieu de les raccourcir', () => {
    const { a, bones } = walking('dos-trois-quarts', 1.25);
    const rest = restBones(a);
    bones.forEach((b, i) => expect(len(b)).toBeCloseTo(len(rest[i]!), 3));
    expect(bones[THIGH]![1][0]).toBeGreaterThan(rest[THIGH]![1][0] + 0.03);
  });
});

describe('personnage posé avant le détourage', () => {
  const cut = 'M0.3 0.1H0.7V0.9H0.3Z';
  const fit = '0.5,0.1;0.5,0.2;0.5,0.5;0.4,0.3;0.35,0.4;0.3,0.5;0.6,0.3;0.65,0.4;0.7,0.5;0.45,0.55;0.45,0.7;0.45,0.9;0.55,0.55;0.55,0.7;0.55,0.9';
  const tmpl = (view: string) => jointsText(templateJoints(0.66667, view));
  const old = (): Layer =>
    ({
      id: 'l',
      kind: 'photo',
      name: 'lama',
      src: 'face.png',
      w: 0.4,
      h: 0.6,
      view: 'face',
      anim: { ...newRig(0.66667), view: 'face', j: tmpl('face') },
      views: [
        { view: 'face', src: '', ratio: 0.66667, j: tmpl('face') },
        { view: 'profil', src: 'profil.png', ratio: 0.66667, j: '0.5,0.1;0.5,0.2;0.5,0.5;0.5,0.3;0.5,0.4;0.5,0.5;0.5,0.3;0.5,0.4;0.5,0.5;0.5,0.55;0.5,0.7;0.5,0.9;0.5,0.55;0.5,0.7;0.5,0.9' },
        { view: 'dos', src: 'dos.png', ratio: 0.66667 },
      ],
    }) as unknown as Layer;

  it('reçoit la silhouette de ses vues et le squelette calé dessus, la découpe posée au repos', () => {
    const found = new Map([
      ['face', { cut, j: fit }],
      ['profil', { cut, j: fit }],
      ['dos', { cut, j: fit }],
    ]);
    const p = withSilhouettes(old(), found)!;
    expect(p.cut).toBe(cut);
    expect(p.anim!.carved).toBe(1);
    // le squelette de départ (gabarit) est remplacé par celui calé sur la silhouette
    expect(p.anim!.j).toBe(fit);
    const dos = p.views!.find((v) => v.view === 'dos')!;
    expect(dos.cut).toBe(cut);
    expect(dos.j).toBe(fit);
    // un squelette ajusté à la main reste
    const profil = p.views!.find((v) => v.view === 'profil')!;
    expect(profil.cut).toBe(cut);
    expect(profil.j).toBe(old().views![1]!.j);
  });
  it('sans silhouette trouvée (image sans transparence), rien ne change', () => {
    expect(withSilhouettes(old(), new Map())).toBeNull();
  });
});
