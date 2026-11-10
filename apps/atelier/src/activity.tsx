import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { type Guide } from './model';
import {
  createTeam,
  fetchProfile,
  palettesOf,
  ROLE_LABELS,
  saveProfile,
  switchTeam,
  type ActivityProfile,
  type ChannelKind,
  type ChannelPick,
  type Connection,
  type ColorRole,
  type Contact,
  type ContactKind,
  type LogoVariant,
  type Me,
  type Palette,
  type PaletteColor,
  type ServiceLink,
  type TeamRef,
} from './server';
import { ensureFont, fontFamily, fontList, fontsFor, loadFonts } from './text';
import { MembersSection } from './team-ui';
import type { MediaType } from '@ftd/core';
import { BRAND_SLOTS, catalogNow, channelsOf, colorGuide, connectionsOf, CONTACT_KINDS, defaultPicks, DEFAULT_OPERATIONS, formatsFor, guidePaletteColor, ROLE_NAMES, slotColor } from './targets';
import { SITE_VARIANTS } from './brand-presets';
import { ColorDialog, swatch } from './color-dialog';
import { MediaIcon, VariantBar } from './targets-ui';

/**
 * L'activité (le groupe, l'association, le lieu…) pour laquelle tout l'outil existe :
 * sa pastille en tête de la barre, son menu, et sa fiche.
 */

export const KINDS = ['Groupe musical', 'Association', 'Lieu culturel', 'Festival', 'Collectif', 'Entreprise', 'Autre'];

/** Logo de l'activité, ou son initiale. */
export function ActivityMark({ team, size = 32 }: { team?: Pick<TeamRef, 'name' | 'logo'> | null; size?: number }) {
  const name = team?.name ?? 'Atelier';
  return (
    <span className="act-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>
      {team?.logo ? <img src={team.logo} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Avatar({ me, size = 36 }: { me: Me; size?: number }) {
  const [broken, setBroken] = useState(false);
  const label = me.name ?? me.email ?? '?';
  return (
    <span className="act-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {me.picture && !broken ? <img src={me.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : label.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Menu de l'activité : l'activité courante en tête, le changement d'activité sous les deux flèches,
 * et la fiche qui se déplie dessous quand on touche le crayon.
 */
export function ActivityMenu(p: { me: Me | null; online: boolean | null; onSaved: () => void }) {
  const { me } = p;
  const team = me?.team;
  const [switching, setSwitching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<SaveState>('idle');
  const [newName, setNewName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // changer d'activité change toutes les compositions visibles : on recharge l'atelier
  const pick = (id: string) => void switchTeam(id).then(() => location.reload(), (e: Error) => setErr(e.message));
  // la liste ne montre que les autres activités : la courante est déjà en tête du menu
  const others = (me?.teams ?? []).filter((t) => t.id !== team?.id).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const owner = team?.role === 'owner';

  return (
    <div className={`bubble act-menu ${editing ? 'editing' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="act-row act-current">
        <ActivityMark team={team} size={44} />
        <span className="act-txt">
          <b>{team?.name ?? 'Atelier'}</b>
          <small>{team ? [team.kind, ROLE_LABELS[team.role]].filter(Boolean).join(' · ') : p.online === false ? 'Hors ligne' : 'Aucune activité'}</small>
        </span>
        {editing && status !== 'idle' && <span className={`act-status ${status}`}>{STATUS_LABELS[status]}</span>}
        {team && (
          <button
            className={`act-icon ${editing ? 'on' : ''}`}
            onClick={() => setEditing(!editing)}
            title={owner ? 'Modifier la fiche de l’activité' : 'Voir la fiche de l’activité'}
            aria-label="Fiche de l’activité"
            aria-expanded={editing}
          >
            <Icon name="pen" />
          </button>
        )}
        {team && (others.length > 0 || me?.admin) && (
          <button className={`act-icon ${switching ? 'on' : ''}`} onClick={() => setSwitching(!switching)} title="Choisir une autre activité" aria-label="Changer d’activité">
            <Icon name="switch" />
          </button>
        )}
      </div>
      {/* comme pour la campagne : la liste flotte sous les deux flèches, par-dessus le menu */}
      {switching && <div className="cm-switch-back" onPointerDown={() => setSwitching(false)} />}
      {switching && (
        <div className="act-switch cm-switch" role="dialog" aria-label="Changer d’activité">
          {others.map((t) => (
            <button key={t.id} className="act-row act-pick" onClick={() => pick(t.id)}>
              <ActivityMark team={t} size={28} />
              <span className="act-txt">
                <b>{t.name}</b>
                <small>{[t.kind, ROLE_LABELS[t.role]].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
          ))}
          {me?.admin && (
            <form
              className="act-new"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                void createTeam(newName.trim()).then(
                  (r) => pick(r.team.id),
                  (e: Error) => setErr(e.message),
                );
              }}
            >
              <input className="pf-input" placeholder="Nouvelle activité…" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nom de la nouvelle activité" />
              <button className="act-icon cm-add" type="submit" disabled={!newName.trim()} title="Créer l’activité" aria-label="Créer l’activité">
                <Icon name="plus" />
              </button>
            </form>
          )}
          {err && <p className="pf-note pf-err">{err}</p>}
        </div>
      )}
      {err && !switching && <p className="pf-note pf-err">{err}</p>}
      {editing && me?.team && <ActivityEditor me={me} onStatus={setStatus} onSaved={p.onSaved} />}
    </div>
  );
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
const STATUS_LABELS: Record<SaveState, string> = { idle: '', pending: 'Modifié…', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Non enregistré' };


/** Bouton de l'utilisateur, à droite de la barre : sa photo ou son initiale. */
export function UserButton({ me, on, onClick }: { me: Me | null; on: boolean; onClick: () => void }) {
  return (
    <button className={`btn user-btn ${on ? 'on' : ''}`} onClick={onClick} title={me ? `${me.name ?? me.email ?? 'Profil'} : profil, préférences, déconnexion` : 'Profil, préférences'} aria-label="Utilisateur">
      {me ? <Avatar me={me} size={28} /> : <Icon name="settings" />}
    </button>
  );
}

/** Menu de l'utilisateur : son profil, ses préférences, puis la déconnexion tout en bas. */
export function UserMenu(p: { me: Me | null; onPrefs: () => void; onCatalog: () => void }) {
  const { me } = p;
  return (
    <div className="bubble user-menu" onPointerDown={(e) => e.stopPropagation()}>
      {me?.mode === 'compte' && (
        <div className="act-row act-user">
          <Avatar me={me} />
          <span className="act-txt">
            <b>{me.name ?? me.email}</b>
            {me.name && me.email && <small>{me.email}</small>}
          </span>
          {me.admin && <span className="tm-badge">admin</span>}
        </div>
      )}
      {me && me.mode !== 'compte' && (
        <div className="act-row act-user">
          <Avatar me={me} />
          <span className="act-txt">
            <b>{me.name}</b>
            <small>{me.mode === 'mot-de-passe' ? 'Mot de passe du groupe' : 'Sur ce poste'}</small>
          </span>
        </div>
      )}

      <button className="row" onClick={p.onPrefs}>
        <Icon name="settings" />
        <span>Préférences</span>
        <small>affichage, système</small>
      </button>
      {me?.admin && (
        <button className="row" onClick={p.onCatalog}>
          <Icon name="settings" />
          <span>Configuration globale</span>
          <small>formats, diffusion, polices</small>
        </button>
      )}
      {/* toujours en bas du menu ; sans compte (accès local ou mot de passe), il n'y a pas de session à fermer */}
      {me?.mode === 'compte' ? (
        <a className="row user-logout" href="/auth/logout">
          <Icon name="logout" />
          <span>Se déconnecter</span>
        </a>
      ) : (
        <button className="row user-logout" disabled title="Pas de compte connecté sur cet accès">
          <Icon name="logout" />
          <span>Se déconnecter</span>
          <small>sans compte ici</small>
        </button>
      )}
    </div>
  );
}


type Tab = 'identity' | 'members' | 'visual' | 'media' | 'projects' | 'sources';
const TABS: Array<[Tab, string]> = [
  ['identity', 'Identité'],
  ['members', 'Membres'],
  ['visual', 'Visuel'],
  ['media', 'Médias'],
  ['projects', 'Types de projet'],
  ['sources', 'Sources'],
];

export const CHANNEL_KINDS: Record<ChannelKind, string> = { social: 'Réseau social', affichage: 'Supports imprimés', impression: 'Impression', email: 'E-mail', site: 'Site web', streaming: 'Streaming' };
const CONTACT_ORDER: ContactKind[] = ['email', 'tel', 'site', 'lien', 'billetterie', 'adresse', 'autre'];
const SOURCE_KINDS = {
  events: { label: 'Évènements', tag: 'ICS', hint: 'agenda, billetterie', placeholder: 'https://… .ics' },
  assets: { label: 'Visuels', tag: 'HTTP', hint: 'dossier en ligne', placeholder: 'https://… (dossier)' },
} as const;
type SourceKind = keyof typeof SOURCE_KINDS;

/**
 * Lit une image importée. Le logo principal (pour voir l'activité) est réduit à 512 px ;
 * le logo d'une variante sert dans les documents : gardé tel quel (transparence, résolution) s'il est léger, sinon 2400 px.
 */
async function logoFromFile(f: File, big = false): Promise<string> {
  const url = await new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(new Error('Lecture impossible'));
    r.readAsDataURL(f);
  });
  if (f.type === 'image/svg+xml' && url.length < (big ? 4_000_000 : 400_000)) return url;
  if (big && /^image\/(png|webp)$/.test(f.type) && url.length < 5_000_000) return url;
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, (big ? 2400 : 512) / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function LogoPick(p: { label: string; url?: string | null; edit: boolean; dark?: boolean; size: number; name: string; big?: boolean; onPick: (dataUrl: string | null) => void; onErr: (m: string) => void }) {
  return (
    <div className="act-logo-slot">
      <label className={`act-logo ${p.edit ? 'editable' : ''} ${p.dark ? 'on-dark' : ''}`} title={p.edit ? `Choisir : ${p.label}` : p.label}>
        {p.url ? (
          <span className="act-mark" style={{ width: p.size, height: p.size }}>
            <img src={p.url} alt="" />
          </span>
        ) : (
          <ActivityMark team={{ name: p.name }} size={p.size} />
        )}
        {p.edit && (
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void logoFromFile(f, p.big).then(p.onPick, (x: Error) => p.onErr(x.message));
              e.target.value = '';
            }}
          />
        )}
      </label>
      {p.label && <small>{p.label}</small>}
    </div>
  );
}

const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <label className={`act-field ${className ?? ''}`}>
    <span className="pf-group">{label}</span>
    {children}
  </label>
);

type Editing = { slot: ColorRole } | { other: number };

/**
 * Une variante : son logo pour les documents, puis une pastille par élément prévu (principale, texte, compléments, bordure, fond, sujets).
 * Toucher une pastille ouvre le même éditeur que l'atelier : couleur unie ou dégradé.
 */
function PaletteEditor(p: {
  pal: Palette;
  first: boolean;
  edit: boolean;
  logo?: string | null;
  name: string;
  set: (q: Palette) => void;
  remove: () => void;
  duplicate: () => void;
  makeFirst: () => void;
  onLogo: (u: string | null) => void;
  onErr: (m: string) => void;
}) {
  const { pal, edit } = p;
  const colors = pal.colors;
  const [editing, setEditing] = useState<Editing | null>(null);
  const setColors = (v: PaletteColor[]) => p.set({ ...pal, colors: v });
  const slotRoles = new Set<string>(BRAND_SLOTS.map((x) => x.role));
  const held = new Set(BRAND_SLOTS.map((x) => slotColor(pal, x.role)).filter(Boolean));
  // les couleurs qui ne tiennent aucune pastille (sans rôle, secondaire…)
  const others = colors.map((c, i) => ({ c, i })).filter(({ c }) => !held.has(c) && !(c.role && slotRoles.has(c.role)));
  const bg = slotColor(pal, 'fond');

  const chip = (key: string, c: PaletteColor | undefined, label: string, open: () => void) => (
    <button key={key} className={`guide act-slot ${c ? '' : 'add'}`} disabled={!edit && !c} onClick={() => edit && open()} title={c ? `${label} : ${c.name || (c.stops ? c.stops.join(' → ') : c.hex)}` : `${label} : à définir`}>
      {c ? <span className="sw" style={{ background: swatch(colorGuide(c)) }} /> : <span className="sw plus">＋</span>}
      <span className="act-slot-label">{label}</span>
    </button>
  );

  let dialog: ReactNode = null;
  if (editing && edit) {
    const slot = 'slot' in editing ? BRAND_SLOTS.find((x) => x.role === editing.slot)! : undefined;
    const cur = slot ? slotColor(pal, slot.role) : colors[(editing as { other: number }).other];
    const idx = cur ? colors.indexOf(cur) : -1;
    const label = slot?.label ?? 'Autre couleur';
    const guide = cur ? colorGuide(cur, cur.name || label) : ({ name: label, type: 'color', color: '#888888' } as Guide);
    const put = (g: Guide) => {
      const name = g.name.trim() && g.name !== label ? g.name : undefined;
      const next = guidePaletteColor(g, slot?.role ?? cur?.role, name);
      setColors(idx < 0 ? [...colors, next] : colors.map((x, j) => (j === idx ? next : x)));
    };
    dialog = (
      <ColorDialog
        className="act-cd"
        kind={label}
        guide={guide}
        onClose={() => setEditing(null)}
        onChange={(g) => put(g)}
        onRemove={
          idx < 0
            ? undefined
            : () => {
                setColors(colors.filter((_, j) => j !== idx));
                setEditing(null);
              }
        }
      />
    );
  }

  return (
    <div className="act-pal">
      <div className="act-pal-head">
        {/* le logo de la variante, posé sur son fond : celui qui part dans les documents */}
        <span className="act-pal-logo" style={bg ? { background: swatch(colorGuide(bg)) } : undefined}>
          <LogoPick label="" url={p.logo} edit={edit} size={40} name={p.name} big onPick={p.onLogo} onErr={p.onErr} />
        </span>
        <input className="pf-input act-pal-name" value={pal.name} disabled={!edit} onChange={(e) => p.set({ ...pal, name: e.target.value })} aria-label="Nom de la variante" />
        <VariantBar pal={pal} />
        {p.first ? (
          <span className="tm-badge">par défaut</span>
        ) : (
          edit && (
            <button className="ab-link" onClick={p.makeFirst}>
              Par défaut
            </button>
          )
        )}
        {edit && (
          <button className="act-pal-dup" onClick={p.duplicate} title="Dupliquer la variante" aria-label="Dupliquer la variante">
            <Icon name="duplicate" />
          </button>
        )}
        {edit && (
          <button className="tm-remove" onClick={p.remove} title="Retirer la variante">
            ×
          </button>
        )}
      </div>
      <div className="act-slots">
        {BRAND_SLOTS.map((x) => chip(x.role, slotColor(pal, x.role), x.label, () => setEditing({ slot: x.role })))}
        {others.map(({ c, i }) => chip(`o${i}`, c, c.name || (c.role ? ROLE_NAMES[c.role] : 'Autre'), () => setEditing({ other: i })))}
        {edit && (
          <button
            className="guide act-slot add"
            onClick={() => {
              setColors([...colors, { hex: '#888888' }]);
              setEditing({ other: colors.length });
            }}
            title="Ajouter une autre couleur à la variante"
          >
            <span className="sw plus">＋</span>
            <span className="act-slot-label">Autre</span>
          </button>
        )}
      </div>
      {dialog}
    </div>
  );
}

/** Polices par usage, comme dans les attributs du texte : chaque police montrée avec elle-même. */
function FontsByUse(p: { fonts: { title?: string; body?: string; accent?: string }; edit: boolean; set: (f: { title?: string; body?: string; accent?: string }) => void }) {
  const [open, setOpen] = useState<'title' | 'body' | 'accent' | null>(null);
  const [, bump] = useState(0);
  const list = fontsFor('branding');
  useEffect(() => {
    // chaque police chargée redessine les puces
    const ids = open ? list.map((f) => f.id) : (Object.values(p.fonts).filter(Boolean) as string[]);
    let live = true;
    void Promise.all(ids.map((id) => ensureFont(id))).then(() => live && bump((n) => n + 1));
    return () => void (live = false);
  }, [open, list.length, p.fonts.title, p.fonts.body, p.fonts.accent]);
  const uses = [
    ['title', 'Titres'],
    ['body', 'Texte'],
    ['accent', 'Accent'],
  ] as const;
  return (
    <>
      <div className="act-fonts">
        {uses.map(([k, label]) => {
          const id = p.fonts[k];
          const f = id ? fontList().find((x) => x.id === id) : undefined;
          return (
            <button key={k} className={`act-font ${open === k ? 'on' : ''}`} disabled={!p.edit && !f} onClick={() => p.edit && setOpen(open === k ? null : k)}>
              <small>{label}</small>
              <span style={f ? { fontFamily: fontFamily(f.id) } : undefined}>{f?.family ?? '—'}</span>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="act-font-cat">
          {list.map((f) => (
            <button
              key={f.id}
              className={p.fonts[open] === f.id ? 'on' : ''}
              style={{ fontFamily: fontFamily(f.id) }}
              onClick={() => {
                p.set({ ...p.fonts, [open]: p.fonts[open] === f.id ? undefined : f.id });
                setOpen(null);
              }}
            >
              {f.family}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Le secret d'une API : jamais relu ; on en tape un nouveau, ou on l'efface. */
function SecretField(p: { set: boolean; value: string | null | undefined; edit: boolean; onChange: (v: string | null | undefined) => void }) {
  const kept = p.set && p.value === undefined;
  return (
    <span className="act-secret">
      <input
        className="pf-input"
        type="password"
        autoComplete="new-password"
        value={p.value ?? ''}
        placeholder={kept ? 'enregistré' : 'Secret'}
        disabled={!p.edit}
        onChange={(e) => p.onChange(e.target.value || undefined)}
        aria-label="Secret de l’API"
      />
      {p.edit && (kept || p.value) && (
        <button className="tm-remove" onClick={() => p.onChange(null)} title="Effacer le secret">
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Branchements de l'activité sur un type de diffusion : un bloc par compte (plusieurs pages Facebook…),
 * avec les champs que le catalogue prévoit pour ce type.
 */
function ConnectionsEditor(p: { media: MediaType; list: Connection[]; edit: boolean; onChange: (l: Connection[]) => void }) {
  const { media: m, list } = p;
  const put = (i: number, patch: Partial<Connection>) => p.onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const site = m.kind === 'site';
  return (
    <div className="act-conns wide">
      {list.map((x, i) => (
        <div key={x.id} className="act-conn">
          <div className="act-conn-head">
            <input className="pf-input act-conn-name" value={x.label ?? ''} disabled={!p.edit} placeholder={`${site ? 'Site' : 'Compte'} ${i + 1}`} onChange={(e) => put(i, { label: e.target.value || undefined })} aria-label="Nom du branchement" />
            {p.edit && (
              <button className="tm-remove" onClick={() => p.onChange(list.filter((_, j) => j !== i))} title="Retirer ce branchement">
                ×
              </button>
            )}
          </div>
          <div className="act-conn-body">
            {m.fields.account && (
              <Field label={site ? 'Adresse du site' : 'Compte'}>
                <input className="pf-input" value={x.account ?? ''} disabled={!p.edit} placeholder={site ? 'monsite.fr' : '@compte'} onChange={(e) => put(i, { account: e.target.value || undefined })} />
              </Field>
            )}
            {m.fields.folder && (
              <Field label="Dossier partagé">
                <input className="pf-input" value={x.folder ?? ''} disabled={!p.edit} placeholder="Drive, Dropbox… (process Make)" onChange={(e) => put(i, { folder: e.target.value || undefined })} />
              </Field>
            )}
            {m.fields.api && (
              <>
                <Field label="API">
                  <input className="pf-input" value={x.api ?? ''} disabled={!p.edit} placeholder="https://…" onChange={(e) => put(i, { api: e.target.value || undefined })} />
                </Field>
                <div className="act-field">
                  <span className="pf-group">Secret</span>
                  <SecretField set={!!x.secretSet} value={x.secret} edit={p.edit} onChange={(v) => put(i, { secret: v })} />
                </div>
              </>
            )}
          </div>
        </div>
      ))}
      {p.edit && (
        <button
          className="pf-btn act-add"
          onClick={() => {
            let n = list.length + 1;
            while (list.some((x) => x.id === `c${n}`)) n++;
            p.onChange([...list, { id: `c${n}` }]);
          }}
        >
          + {site ? 'Site' : 'Compte'}
        </button>
      )}
    </div>
  );
}

/**
 * La fiche de l'activité, dépliée sous son en-tête. Tout s'enregistre au fil des changements ;
 * seuls les responsables modifient, les autres membres la lisent.
 */
function ActivityEditor(p: { me: Me; onStatus: (s: SaveState) => void; onSaved: () => void }) {
  const team = p.me.team!;
  const edit = team.role === 'owner';
  const [tab, setTab] = useState<Tab>('identity');
  const [prof, setProf] = useState<ActivityProfile | null>(null);
  const [logos, setLogos] = useState<Partial<Record<LogoVariant, string | null>>>({});
  const [kw, setKw] = useState('');
  const [fontsReady, setFontsReady] = useState(fontList().length > 0);
  const [err, setErr] = useState<string | null>(null);
  const [kindOther, setKindOther] = useState(false);
  const [adding, setAdding] = useState<SourceKind | null>(null);
  const [src, setSrc] = useState({ name: '', url: '' });
  const dirty = useRef<{ prof: ActivityProfile; logos: Partial<Record<LogoVariant, string | null>> } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetchProfile(team.id).then(
      (x) =>
        setProf({
          ...x,
          // choix d'origine tant que l'activité n'a pas les siens
          channels: x.channels?.length ? x.channels : defaultPicks(),
          operations: x.operations ?? DEFAULT_OPERATIONS,
          // les anciennes mentions deviennent des coordonnées libres
          contacts: x.contacts?.length ? x.contacts : (x.branding?.mentions ?? []).map((m) => ({ kind: 'autre' as const, label: m.name, value: m.text })),
          // Flow Therapy sans variante : on propose celles du site, gardées au premier enregistrement
          ...(!palettesOf(x).length && /flow/i.test(x.name || team.name) ? { branding: { ...x.branding, palettes: SITE_VARIANTS.map((q) => ({ ...q, colors: q.colors.map((c) => ({ ...c })) })) } } : {}),
        }),
      (e: Error) => setErr(e.message),
    );
    void loadFonts().then(() => setFontsReady(true));
  }, [team.id]);

  // enregistrement au fil de l'eau : on attend une courte pause dans la saisie
  const flush = async () => {
    window.clearTimeout(timer.current);
    const d = dirty.current;
    if (!d) return;
    dirty.current = null;
    p.onStatus('saving');
    try {
      const { id: _id, logos: _l, ...rest } = d.prof;
      const main = d.logos.main;
      const others = Object.fromEntries(Object.entries(d.logos).filter(([k]) => k !== 'main'));
      const r = await saveProfile(team.id, { ...rest, ...(main !== undefined ? { logo: main } : {}), ...(Object.keys(others).length ? { logos: others } : {}) });
      // les adresses des logos reviennent du serveur ; les secrets restent signalés seulement
      setProf((x) => (x ? { ...x, logos: r.profile.logos, channels: x.channels?.map((c) => (c.secret === undefined ? c : { ...c, secret: undefined, secretSet: c.secret !== null })) } : x));
      setLogos((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !(k in d.logos))));
      if (!dirty.current) p.onStatus('saved');
      p.onSaved();
    } catch (e) {
      setErr((e as Error).message);
      p.onStatus('error');
    }
  };
  const schedule = (next: ActivityProfile, nextLogos = logos) => {
    if (!edit) return;
    dirty.current = { prof: next, logos: nextLogos };
    p.onStatus('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  };
  // en quittant la fiche, ce qui attend part tout de suite
  useEffect(() => () => void flush(), []);

  const set = (patch: Partial<ActivityProfile>) =>
    setProf((x) => {
      if (!x) return x;
      const next = { ...x, ...patch };
      schedule(next);
      return next;
    });
  const setLogo = (k: LogoVariant, u: string | null) => {
    const nextLogos = { ...logos, [k]: u };
    setLogos(nextLogos);
    if (prof) schedule(prof, nextLogos);
  };

  if (!prof) return <div className="act-edit">{err ? <p className="pf-note pf-err">{err}</p> : <p className="pf-note">Chargement…</p>}</div>;

  const branding = prof.branding ?? {};
  const setBranding = (patch: Partial<NonNullable<ActivityProfile['branding']>>) => set({ branding: { ...branding, ...patch } });
  const palettes = palettesOf(prof);
  const setPalettes = (v: Palette[]) => setBranding({ palettes: v, palette: undefined });
  const addPalette = () => {
    const id = `palette-${Date.now().toString(36)}`;
    const base = palettes[0]?.colors ?? SITE_VARIANTS[0]!.colors;
    setPalettes([...palettes, { id, name: palettes.length ? `Variante ${palettes.length + 1}` : 'Principale', colors: base.map((c) => ({ ...c, ...(c.stops ? { stops: [...c.stops] } : {}) })) }]);
  };
  // copie juste après l'originale, logo de variante compris
  const duplicatePalette = (pi: number) => {
    const src = palettes[pi]!;
    const id = `palette-${Date.now().toString(36)}`;
    const copy: Palette = { ...src, id, name: `${src.name} (copie)`, colors: src.colors.map((c) => ({ ...c, ...(c.stops ? { stops: [...c.stops] } : {}) })) };
    const next = { ...prof, branding: { ...branding, palettes: [...palettes.slice(0, pi + 1), copy, ...palettes.slice(pi + 1)], palette: undefined } };
    const lg = palLogo(src.id);
    const nextLogos = lg ? { ...logos, [`pal-${id}`]: lg } : logos;
    setProf(next);
    setLogos(nextLogos);
    schedule(next, nextLogos);
  };
  const keywords = branding.keywords ?? [];
  const addKeywords = (text: string) => {
    const add = text
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && !keywords.includes(k));
    if (add.length) setBranding({ keywords: [...keywords, ...add] });
    setKw('');
  };
  const contacts = prof.contacts ?? [];
  const setContacts = (v: Contact[]) => set({ contacts: v });
  const picks = prof.channels ?? [];
  const setPick = (id: string, patch: Partial<ChannelPick> | null) =>
    set({ channels: patch === null ? picks.filter((c) => c.id !== id) : picks.some((c) => c.id === id) ? picks.map((c) => (c.id === id ? { ...c, ...patch } : c)) : [...picks, { id, ...patch }] });
  // les médias retenus, complétés par le catalogue
  const chans = channelsOf(prof);
  const catalog = catalogNow();
  const legacy = picks.filter((c) => !catalog.media.some((m) => m.id === c.id));
  const operations = prof.operations ?? [];
  const setOperations = (v: typeof operations) => set({ operations: v });
  const services = prof.services ?? {};
  const shownLogo = 'main' in logos ? logos.main : (prof.logos?.main ?? team.logo);
  const palLogo = (id: string) => (`pal-${id}` in logos ? logos[`pal-${id}`] : prof.logos?.[`pal-${id}`]);
  const media = channelsOf({ ...prof, channels: picks }).flatMap((c) => connectionsOf(c).filter((x) => x.account).map((x) => ({ ch: c, x })));
  const kinds = prof.kind && !KINDS.includes(prof.kind) ? [...KINDS.slice(0, -1), prof.kind] : KINDS;

  return (
    <div className="act-edit">
      <div className="seg act-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {!edit && <span className="tm-badge act-ro" title="Seuls les responsables modifient la fiche">lecture seule</span>}

      <div className="act-body">
        {tab === 'identity' && (
          <>
            <div className="act-identity">
              <LogoPick label="Logo" url={shownLogo} edit={edit} size={88} name={team.name} onPick={(u) => setLogo('main', u)} onErr={setErr} />
              <div className="act-fields">
                <Field label="Nom">
                  <input className="pf-input" value={prof.name} disabled={!edit} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <div className="act-field">
                  <span className="pf-group">Type d’activité</span>
                  <div className="act-checks">
                    {kinds.map((k) =>
                      k === 'Autre' ? null : (
                        <button key={k} className={`act-check ${prof.kind === k ? 'on' : ''}`} disabled={!edit} onClick={() => set({ kind: prof.kind === k ? undefined : k })}>
                          {k}
                        </button>
                      ),
                    )}
                    {edit &&
                      (kindOther ? (
                        <input className="pf-input act-kind-input" autoFocus placeholder="Autre…" onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} onBlur={(e) => (e.target.value.trim() && set({ kind: e.target.value.trim() }), setKindOther(false))} />
                      ) : (
                        <button className="act-check" onClick={() => setKindOther(true)}>
                          Autre…
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
            <Field label="Raison d’être">
              <textarea className="pf-input act-purpose" rows={3} value={branding.purpose ?? ''} disabled={!edit} placeholder="Pourquoi cette activité existe, ce qu’elle veut faire ressentir…" onChange={(e) => setBranding({ purpose: e.target.value })} />
            </Field>
            <div className="act-field">
              <span className="pf-group">Mots-clés</span>
              <div className="act-keywords">
                {keywords.map((k) => (
                  <span key={k} className="act-kw">
                    {k}
                    {edit && (
                      <button onClick={() => setBranding({ keywords: keywords.filter((x) => x !== k) })} aria-label={`Retirer ${k}`}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {edit && (
                  <input
                    className="pf-input act-kw-input"
                    value={kw}
                    placeholder="psyché, groove, #hashtag…"
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addKeywords(kw);
                      }
                    }}
                    onBlur={() => kw.trim() && addKeywords(kw)}
                  />
                )}
              </div>
            </div>
            <div className="act-field">
              <span className="pf-group">Coordonnées</span>
              {contacts.map((c, i) => (
                <div key={i} className="act-contact">
                  <select className="pf-input" value={c.kind} disabled={!edit} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, kind: e.target.value as ContactKind } : x)))} aria-label="Type">
                    {CONTACT_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {CONTACT_KINDS[k]}
                      </option>
                    ))}
                  </select>
                  <input className="pf-input" value={c.value} disabled={!edit} placeholder={c.kind === 'email' ? 'contact@…' : c.kind === 'tel' ? '06 …' : 'https://…'} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label="Coordonnée" />
                  <input className="pf-input" value={c.label ?? ''} disabled={!edit} placeholder="précision" onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, label: e.target.value || undefined } : x)))} aria-label="Précision" />
                  {edit && (
                    <button className="tm-remove" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} title="Retirer">
                      ×
                    </button>
                  )}
                </div>
              ))}
              {media.map(({ ch: c, x }) => (
                <div key={`${c.id}/${x.id}`} className="act-contact from" title="Compte renseigné dans Médias">
                  <span className="act-contact-media">
                    <MediaIcon ch={c} size={18} />
                    {x.label || c.name}
                  </span>
                  <span className="act-contact-val">{x.account}</span>
                </div>
              ))}
              {edit && (
                <button className="pf-btn act-add" onClick={() => setContacts([...contacts, { kind: 'email', value: '' }])}>
                  + Coordonnée
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'members' && <MembersSection me={p.me} />}

        {tab === 'visual' && (
          <>
            <div className="pf-group">Polices par usage</div>
            {fontsReady && <FontsByUse fonts={branding.fonts ?? {}} edit={edit} set={(f) => setBranding({ fonts: f })} />}
            <div className="pf-group">Variantes</div>
            {palettes.map((pal, pi) => (
              <PaletteEditor
                key={pal.id}
                pal={pal}
                first={pi === 0}
                edit={edit}
                name={prof.name || team.name}
                logo={palLogo(pal.id)}
                onLogo={(u) => setLogo(`pal-${pal.id}`, u)}
                onErr={setErr}
                set={(q) => setPalettes(palettes.map((x, j) => (j === pi ? q : x)))}
                remove={() => setPalettes(palettes.filter((_, j) => j !== pi))}
                duplicate={() => duplicatePalette(pi)}
                makeFirst={() => setPalettes([pal, ...palettes.filter((_, j) => j !== pi)])}
              />
            ))}
            {edit && (
              <div className="act-pal-actions">
                <button className="pf-btn act-add" onClick={addPalette}>
                  + Nouvelle variante
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'media' && (
          <>
            {catalog.media.map((m) => {
              const pk = picks.find((c) => c.id === m.id);
              const ch = chans.find((c) => c.id === m.id);
              return (
                <div key={m.id} className={`act-media ${pk ? 'on' : ''}`}>
                  <div className="act-media-head">
                    <MediaIcon ch={ch ?? { id: m.id, name: m.name, kind: m.kind, formats: m.formats }} size={28} />
                    <span className="act-txt">
                      <b>{m.name}</b>
                      {/* les formats appartiennent au type de diffusion (catalogue) : la fiche n'en montre que la famille */}
                      {CHANNEL_KINDS[m.kind] !== m.name && <small>{CHANNEL_KINDS[m.kind]}</small>}
                    </span>
                    <button className={`act-toggle ${pk ? 'on' : ''}`} disabled={!edit} role="switch" aria-checked={!!pk} aria-label={`Diffuser sur ${m.name}`} onClick={() => setPick(m.id, pk ? null : {})} />
                  </div>
                  {pk && (
                    <div className="act-media-body">
                      {palettes.length > 1 && (
                        <Field label="Variante">
                          <select className="pf-input" value={pk.palette ?? palettes[0]!.id} disabled={!edit} onChange={(e) => setPick(m.id, { palette: e.target.value })}>
                            {palettes.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      {(m.fields.account || m.fields.api || m.fields.folder) && (
                        <ConnectionsEditor
                          media={m}
                          list={connectionsOf(pk)}
                          edit={edit}
                          onChange={(connections) => setPick(m.id, { connections, account: undefined, url: undefined, api: undefined, secret: undefined, secretSet: undefined, folder: undefined })}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {legacy.map((c) => (
              <div key={c.id} className="act-media on">
                <div className="act-media-head">
                  <MediaIcon ch={chans.find((x) => x.id === c.id)} size={28} />
                  <span className="act-txt">
                    <b>{c.name || c.id}</b>
                    <small>hors catalogue</small>
                  </span>
                  {edit && (
                    <button className="tm-remove" onClick={() => setPick(c.id, null)} title="Retirer">
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'projects' && (
          <>
            {operations.map((o, i) => (
              <div key={o.id} className="act-pal">
                <div className="act-pal-head">
                  <input className="pf-input act-pal-name" value={o.name} placeholder="Concert, album…" disabled={!edit} onChange={(e) => setOperations(operations.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nom du type de projet" />
                  {edit && (
                    <button className="tm-remove" onClick={() => setOperations(operations.filter((_, j) => j !== i))} title="Retirer ce type de projet">
                      ×
                    </button>
                  )}
                </div>
                <div className="act-checks">
                  {chans.flatMap((c) =>
                    formatsFor(c).map((fm) => {
                      const on = o.targets.some((t) => t.channel === c.id && t.format === fm.id);
                      return (
                        <button
                          key={`${c.id}/${fm.id}`}
                          className={`act-check ${on ? 'on' : ''}`}
                          disabled={!edit}
                          onClick={() =>
                            setOperations(
                              operations.map((x, j) =>
                                j === i ? { ...x, targets: on ? x.targets.filter((t) => !(t.channel === c.id && t.format === fm.id)) : [...x.targets, { channel: c.id, format: fm.id }] } : x,
                              ),
                            )
                          }
                        >
                          {c.name} · {fm.title}
                        </button>
                      );
                    }),
                  )}
                </div>
              </div>
            ))}
            {edit && (
              <button className="pf-btn act-add" onClick={() => setOperations([...operations, { id: `projet-${Date.now().toString(36)}`, name: '', targets: [] }])}>
                + Type de projet
              </button>
            )}
          </>
        )}

        {tab === 'sources' && (
          <>
            {(Object.keys(SOURCE_KINDS) as SourceKind[]).flatMap((k) =>
              (services[k] ?? []).map((s: ServiceLink, i: number) => (
                <div key={`${k}${i}`} className="act-source">
                  <span className="tm-badge">{SOURCE_KINDS[k].label}</span>
                  <input className="pf-input" value={s.name} disabled={!edit} onChange={(e) => set({ services: { ...services, [k]: (services[k] ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) } })} aria-label="Nom" />
                  <input className="pf-input" value={s.url ?? ''} disabled={!edit} placeholder={SOURCE_KINDS[k].placeholder} onChange={(e) => set({ services: { ...services, [k]: (services[k] ?? []).map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) } })} aria-label="Adresse" />
                  {edit && (
                    <button className="tm-remove" onClick={() => set({ services: { ...services, [k]: (services[k] ?? []).filter((_, j) => j !== i) } })} title="Retirer">
                      ×
                    </button>
                  )}
                </div>
              )),
            )}
            {!(services.events?.length || services.assets?.length) && !edit && <p className="pf-note">Aucune source pour l’instant.</p>}
            {edit &&
              (adding ? (
                <form
                  className="act-source-new"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!src.name.trim() && !src.url.trim()) return;
                    set({ services: { ...services, [adding]: [...(services[adding] ?? []), { name: src.name.trim() || src.url.trim(), ...(src.url.trim() ? { url: src.url.trim() } : {}) }] } });
                    setSrc({ name: '', url: '' });
                    setAdding(null);
                  }}
                >
                  <div className="act-source-kinds">
                    {(Object.keys(SOURCE_KINDS) as SourceKind[]).map((k) => (
                      <button key={k} type="button" className={`act-source-kind ${adding === k ? 'on' : ''}`} onClick={() => setAdding(k)}>
                        <span className="tm-badge">{SOURCE_KINDS[k].tag}</span>
                        <b>{SOURCE_KINDS[k].label}</b>
                        <small>{SOURCE_KINDS[k].hint}</small>
                      </button>
                    ))}
                  </div>
                  <div className="act-source">
                    <input className="pf-input" autoFocus value={src.name} placeholder="Nom" onChange={(e) => setSrc({ ...src, name: e.target.value })} aria-label="Nom de la source" />
                    <input className="pf-input" value={src.url} placeholder={SOURCE_KINDS[adding].placeholder} onChange={(e) => setSrc({ ...src, url: e.target.value })} aria-label="Adresse de la source" />
                    <button className="pf-btn act-primary" type="submit">
                      Ajouter
                    </button>
                    <button className="tm-remove" type="button" onClick={() => setAdding(null)} title="Annuler">
                      ×
                    </button>
                  </div>
                </form>
              ) : (
                <button className="pf-btn act-add" onClick={() => setAdding('events')}>
                  + Nouvelle source
                </button>
              ))}
          </>
        )}
        {err && <p className="pf-note pf-err">{err}</p>}
      </div>
    </div>
  );
}
