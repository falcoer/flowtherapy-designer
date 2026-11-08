import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { FORMATS } from './model';
import { createTeam, fetchProfile, palettesOf, ROLE_LABELS, saveProfile, switchTeam, type ActivityProfile, type Channel, type ChannelKind, type ColorRole, type LogoVariant, type Me, type Operation, type Palette, type PaletteColor, type ServiceLink, type TeamRef } from './server';
import { fontList, loadFonts } from './text';
import { MembersSection } from './team-ui';
import { DEFAULT_CHANNELS, DEFAULT_OPERATIONS, formatsFor } from './targets';
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

/** Menu de l'activité : l'activité courante, le profil connecté, les préférences, la déconnexion. */
export function ActivityMenu(p: { me: Me | null; online: boolean | null; onEdit: () => void; onPrefs: () => void }) {
  const { me } = p;
  const team = me?.team;
  const [switching, setSwitching] = useState(false);
  const [newName, setNewName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // changer d'activité change toutes les compositions visibles : on recharge l'atelier
  const pick = (id: string) => void switchTeam(id).then(() => location.reload(), (e: Error) => setErr(e.message));
  const teams = [...(me?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div className="bubble act-menu" onPointerDown={(e) => e.stopPropagation()}>
      <div className="act-row act-current">
        <ActivityMark team={team} size={44} />
        <span className="act-txt">
          <b>{team?.name ?? 'Atelier'}</b>
          <small>{team ? [team.kind, ROLE_LABELS[team.role]].filter(Boolean).join(' · ') : p.online === false ? 'Hors ligne : tout reste dans ce navigateur' : 'Aucune activité'}</small>
        </span>
        {team && (
          <button className="act-icon" onClick={p.onEdit} title={team.role === 'owner' ? 'Modifier la fiche de l’activité' : 'Voir la fiche de l’activité'} aria-label="Fiche de l’activité">
            <Icon name="pen" />
          </button>
        )}
        {team && (teams.length > 1 || me?.admin) && (
          <button className={`act-icon ${switching ? 'on' : ''}`} onClick={() => setSwitching(!switching)} title="Choisir une autre activité" aria-label="Changer d’activité">
            <Icon name="switch" />
          </button>
        )}
      </div>
      {switching && (
        <div className="act-switch">
          {teams.map((t) => (
            <button key={t.id} className={`act-row act-pick ${t.id === team?.id ? 'on' : ''}`} onClick={() => t.id !== team?.id && pick(t.id)}>
              <ActivityMark team={t} size={28} />
              <span className="act-txt">
                <b>{t.name}</b>
                <small>{[t.kind, ROLE_LABELS[t.role]].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
          ))}
          {me?.admin && (
            <form
              className="tm-invite"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                void createTeam(newName.trim()).then(
                  (r) => pick(r.team.id),
                  (e: Error) => setErr(e.message),
                );
              }}
            >
              <input className="pf-input" placeholder="Nouvelle activité" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nom de la nouvelle activité" />
              <button className="pf-btn" type="submit" disabled={!newName.trim()}>
                Créer
              </button>
            </form>
          )}
        </div>
      )}
      {err && <p className="pf-note pf-err">{err}</p>}

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
      {me?.mode === 'compte' && (
        <a className="row" href="/auth/logout">
          <Icon name="logout" />
          <span>Se déconnecter</span>
        </a>
      )}
    </div>
  );
}

type FormTab = 'identity' | 'branding' | 'channels' | 'operations' | 'services' | 'members';

export const ROLE_COLOR_LABELS: Record<ColorRole, string> = { fond: 'Fond', texte: 'Texte', accent: 'Accent', secondaire: 'Secondaire' };
export const CHANNEL_KINDS: Record<ChannelKind, string> = { social: 'Réseau social', affichage: 'Affichage', impression: 'Impression', email: 'E-mail', site: 'Site' };
const LOGO_LABELS: Record<LogoVariant, string> = { main: 'Principal', light: 'Clair (fond sombre)', dark: 'Sombre (fond clair)', icon: 'Icône seule' };
type Variant = Exclude<LogoVariant, 'main'>;

/** Réduit une image importée à 256 px de côté (PNG) ; un SVG léger reste tel quel. */
async function logoFromFile(f: File): Promise<string> {
  const url = await new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(new Error('Lecture impossible'));
    r.readAsDataURL(f);
  });
  if (f.type === 'image/svg+xml' && url.length < 400_000) return url;
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function LogoPick(p: { label: string; url?: string | null; edit: boolean; dark?: boolean; size: number; name: string; onPick: (dataUrl: string | null) => void; onErr: (m: string) => void }) {
  return (
    <div className="act-logo-slot">
      <label className={`act-logo ${p.edit ? 'editable' : ''} ${p.dark ? 'on-dark' : ''}`} title={p.edit ? `Choisir : ${p.label}` : p.label}>
        {p.url ? <span className="act-mark" style={{ width: p.size, height: p.size }}><img src={p.url} alt="" /></span> : <ActivityMark team={{ name: p.name }} size={p.size} />}
        {p.edit && (
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void logoFromFile(f).then(p.onPick, (x: Error) => p.onErr(x.message));
              e.target.value = '';
            }}
          />
        )}
      </label>
      <small>{p.label}</small>
      {p.edit && p.url && (
        <button className="ab-link" onClick={() => p.onPick(null)}>
          Retirer
        </button>
      )}
    </div>
  );
}

function LinkList(p: { title: string; hint: string; items: ServiceLink[]; set: (v: ServiceLink[]) => void; edit: boolean; placeholder: string }) {
  return (
    <div className="act-field">
      <div className="pf-group">{p.title}</div>
      <p className="pf-note">{p.hint}</p>
      {p.items.map((it, i) => (
        <div key={i} className="act-link">
          <input className="pf-input" value={it.name} placeholder={p.placeholder} disabled={!p.edit} onChange={(e) => p.set(p.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nom" />
          <input className="pf-input" value={it.url ?? ''} placeholder="https://…" disabled={!p.edit} onChange={(e) => p.set(p.items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} aria-label="Adresse" />
          {p.edit && (
            <button className="tm-remove" onClick={() => p.set(p.items.filter((_, j) => j !== i))} title="Retirer">
              ×
            </button>
          )}
        </div>
      ))}
      {!p.items.length && !p.edit && <p className="pf-note">Rien pour l’instant.</p>}
      {p.edit && (
        <button className="pf-btn act-add" onClick={() => p.set([...p.items, { name: '' }])}>
          + Ajouter
        </button>
      )}
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="act-field">
    <span className="pf-group">{label}</span>
    {children}
  </label>
);

/** Une palette nommée : couleurs et rôles. */
function PaletteEditor(p: { pal: Palette; first: boolean; edit: boolean; set: (q: Palette) => void; remove: () => void; makeFirst: () => void }) {
  const { pal, edit } = p;
  const colors = pal.colors;
  const setColors = (v: PaletteColor[]) => p.set({ ...pal, colors: v });
  return (
    <div className="act-pal">
      <div className="act-pal-head">
        <VariantBar pal={pal} />
        <input className="pf-input act-pal-name" value={pal.name} disabled={!edit} onChange={(e) => p.set({ ...pal, name: e.target.value })} aria-label="Nom de la variante" />
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
          <button className="tm-remove" onClick={p.remove} title="Retirer la variante">
            ×
          </button>
        )}
      </div>
      <div className="act-palette">
        {colors.map((c, i) => (
          <div key={i} className="act-swatch">
            <label className="act-chip" style={{ background: c.hex }} title={c.hex}>
              {edit && <input type="color" value={c.hex} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />}
            </label>
            <span className="act-swatch-txt">
              <input className="act-cname" value={c.name ?? ''} placeholder={c.hex} disabled={!edit} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nom de la couleur" />
              <select className="act-role" value={c.role ?? ''} disabled={!edit} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, role: (e.target.value || undefined) as ColorRole | undefined } : x)))} aria-label="Rôle">
                <option value="">sans rôle</option>
                {Object.entries(ROLE_COLOR_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </span>
            {edit && (
              <button className="tm-remove" onClick={() => setColors(colors.filter((_, j) => j !== i))} title="Retirer">
                ×
              </button>
            )}
          </div>
        ))}
        {edit && (
          <button className="act-chip act-chip-add" onClick={() => setColors([...colors, { hex: '#888888' }])} title="Ajouter une couleur">
            +
          </button>
        )}
      </div>
    </div>
  );
}

/** Un canal de communication : type, formats, marge, zone d'intérêt, logo, mentions, compte. */
function ChannelCard(p: { c: Channel; set: (c: Channel) => void; remove: () => void; edit: boolean; mentions: string[]; palettes: Palette[]; open: boolean; toggle: () => void }) {
  const { c } = p;
  const fmt = (id: string) => FORMATS.find((f) => f.id === id)?.title ?? id;
  return (
    <div className={`act-channel ${p.open ? 'open' : ''}`}>
      <button className="act-channel-head" onClick={p.toggle} aria-expanded={p.open}>
        <MediaIcon ch={c} size={26} />
        <span className="act-txt">
          <b>{c.name || 'Nouveau média'}</b>
          <small>{[CHANNEL_KINDS[c.kind], c.formats.map(fmt).join(', ')].filter(Boolean).join(' · ')}</small>
        </span>
        <span className="ab-chev">{p.open ? '−' : '+'}</span>
      </button>
      {p.open && (
        <div className="act-channel-body">
          <div className="act-row2">
            <Field label="Nom">
              <input className="pf-input" value={c.name} placeholder="Post Instagram" disabled={!p.edit} onChange={(e) => p.set({ ...c, name: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="pf-input" value={c.kind} disabled={!p.edit} onChange={(e) => p.set({ ...c, kind: e.target.value as ChannelKind })}>
                {Object.entries(CHANNEL_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="pf-group">Formats</div>
          <div className="act-checks">
            {FORMATS.map((f) => (
              <label key={f.id} className={`act-check ${c.formats.includes(f.id) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={c.formats.includes(f.id)}
                  disabled={!p.edit}
                  onChange={(e) => p.set({ ...c, formats: e.target.checked ? [...c.formats, f.id] : c.formats.filter((x) => x !== f.id) })}
                />
                {f.title}
              </label>
            ))}
          </div>
          <div className="act-row2">
            <Field label={`Marge : ${Math.round((c.margin ?? 0.05) * 100)} %`}>
              <input type="range" min={0} max={15} step={0.5} value={(c.margin ?? 0.05) * 100} disabled={!p.edit} onChange={(e) => p.set({ ...c, margin: Number(e.target.value) / 100 })} />
            </Field>
            <Field label="Logo à utiliser">
              <select className="pf-input" value={c.logo ?? 'main'} disabled={!p.edit} onChange={(e) => p.set({ ...c, logo: e.target.value as LogoVariant })}>
                {Object.entries(LOGO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {p.palettes.length > 1 && (
            <Field label="Variante de couleurs">
              <select className="pf-input" value={c.palette ?? p.palettes[0].id} disabled={!p.edit} onChange={(e) => p.set({ ...c, palette: e.target.value })}>
                {p.palettes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Zone d’intérêt">
            <input className="pf-input" value={c.focus ?? ''} placeholder="ex. éviter le bas (boutons de la story)" disabled={!p.edit} onChange={(e) => p.set({ ...c, focus: e.target.value })} />
          </Field>
          {p.mentions.length > 0 && (
            <>
              <div className="pf-group">Mentions à poser</div>
              <div className="act-checks">
                {p.mentions.map((m) => (
                  <label key={m} className={`act-check ${c.mentions?.includes(m) ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!c.mentions?.includes(m)}
                      disabled={!p.edit}
                      onChange={(e) => p.set({ ...c, mentions: e.target.checked ? [...(c.mentions ?? []), m] : (c.mentions ?? []).filter((x) => x !== m) })}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </>
          )}
          <Field label="Compte où publier">
            <input className="pf-input" value={c.url ?? ''} placeholder="https://instagram.com/…" disabled={!p.edit} onChange={(e) => p.set({ ...c, url: e.target.value })} />
          </Field>
          {p.edit && (
            <button className="ab-link act-danger" onClick={p.remove}>
              Retirer ce canal
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Fiche de l'activité : identité, branding général, canaux, services, membres. Les responsables la modifient. */
export function ActivityForm(p: { me: Me; onClose: () => void; onSaved: () => void }) {
  const team = p.me.team!;
  const edit = team.role === 'owner';
  const [tab, setTab] = useState<FormTab>('identity');
  const [prof, setProf] = useState<ActivityProfile | null>(null);
  const [logo, setLogo] = useState<string | null | undefined>(undefined); // undefined : inchangé
  const [variants, setVariants] = useState<Partial<Record<Variant, string | null>>>({});
  const [kw, setKw] = useState('');
  const [openCh, setOpenCh] = useState<string | null>(null);
  const [fonts, setFonts] = useState(fontList());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProfile(team.id).then(
      // médias et occasions proposés tant que l'activité n'a pas les siens
      (x) => setProf({ ...x, channels: x.channels?.length ? x.channels : DEFAULT_CHANNELS, operations: x.operations ?? DEFAULT_OPERATIONS }),
      (e: Error) => setErr(e.message),
    );
    void loadFonts().then(setFonts);
  }, [team.id]);

  const set = (patch: Partial<ActivityProfile>) => setProf((x) => (x ? { ...x, ...patch } : x));
  const services = prof?.services ?? {};
  const branding = prof?.branding ?? {};
  const channels = prof?.channels ?? [];
  const setServices = (k: keyof NonNullable<ActivityProfile['services']>, v: ServiceLink[]) => set({ services: { ...services, [k]: v } });
  const setBranding = (patch: Partial<NonNullable<ActivityProfile['branding']>>) => set({ branding: { ...branding, ...patch } });
  const palettes = palettesOf(prof);
  const setPalettes = (v: Palette[]) => setBranding({ palettes: v, palette: undefined });
  const addPalette = () => {
    const id = `palette-${Date.now().toString(36)}`;
    setPalettes([...palettes, { id, name: palettes.length ? `Palette ${palettes.length + 1}` : 'Principale', colors: [{ hex: '#1d1b22', role: 'fond' }, { hex: '#ffffff', role: 'texte' }] }]);
  };
  const keywords = branding.keywords ?? [];
  const mentions = branding.mentions ?? [];
  const addKeywords = (text: string) => {
    const add = text
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && !keywords.includes(k));
    if (add.length) setBranding({ keywords: [...keywords, ...add] });
    setKw('');
  };
  const setOperation = (i: number, o: Operation) => set({ operations: (prof?.operations ?? []).map((x, j) => (j === i ? o : x)) });
  const setChannel = (i: number, c: Channel) => set({ channels: channels.map((x, j) => (j === i ? c : x)) });
  const addChannel = () => {
    const id = `canal-${Date.now().toString(36)}`;
    set({ channels: [...channels, { id, name: '', kind: 'social', formats: ['carre'], margin: 0.05, mentions: [] }] });
    setOpenCh(id);
  };

  const save = async () => {
    if (!prof) return;
    setBusy(true);
    setErr(null);
    try {
      const pending = kw.trim() ? [...keywords, ...kw.split(',').map((k) => k.trim()).filter(Boolean)] : keywords;
      const { id: _id, logos: _l, ...rest } = prof;
      await saveProfile(team.id, {
        ...rest,
        branding: { ...branding, keywords: pending },
        ...(logo !== undefined ? { logo } : {}),
        ...(Object.keys(variants).length ? { logos: variants } : {}),
      });
      p.onSaved();
      p.onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shownLogo = logo === undefined ? (prof?.logos?.main ?? team.logo) : logo;
  const shownVariant = (k: Variant) => (k in variants ? variants[k] : prof?.logos?.[k]);
  const tabs = [
    ['identity', 'Identité'],
    ['branding', 'Branding'],
    ['channels', 'Médias'],
    ['operations', 'Occasions'],
    ['services', 'Services'],
    ['members', 'Membres'],
  ] as const;

  return (
    <div className="bubble act-form" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pf-head">
        <span className="b-title">Fiche de l’activité</span>
        <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="seg pf-tabs act-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {!prof && !err && <p className="pf-note">Chargement…</p>}
      {prof && tab === 'identity' && (
        <div className="pf-body">
          <div className="act-identity">
            <LogoPick label="Logo" url={shownLogo} edit={edit} size={88} name={prof.name || team.name} onPick={setLogo} onErr={setErr} />
            <div className="act-fields">
              <Field label="Nom">
                <input className="pf-input" value={prof.name} disabled={!edit} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Type d’activité">
                <input className="pf-input" list="act-kinds" value={prof.kind ?? ''} placeholder="Groupe musical" disabled={!edit} onChange={(e) => set({ kind: e.target.value })} />
                <datalist id="act-kinds">
                  {KINDS.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </Field>
            </div>
          </div>
          <div className="pf-group">Variantes du logo</div>
          <div className="act-variants">
            {(['light', 'dark', 'icon'] as Variant[]).map((k) => (
              <LogoPick
                key={k}
                label={LOGO_LABELS[k]}
                url={shownVariant(k)}
                edit={edit}
                dark={k === 'light'}
                size={56}
                name={prof.name || team.name}
                onPick={(u) => setVariants((v) => ({ ...v, [k]: u }))}
                onErr={setErr}
              />
            ))}
          </div>
          {edit && <p className="pf-note">Touche un logo pour le choisir (PNG, JPEG, SVG). Chaque canal dit quelle variante utiliser.</p>}
        </div>
      )}
      {prof && tab === 'branding' && (
        <div className="pf-body">
          <div className="pf-group">Variantes de couleurs</div>
          <p className="pf-note">Chaque variante (jour, nuit, saison…) est une base de palette. Les compositions colorent avec ces rôles : changer de variante recolore tout, sur tous les supports. La première sert par défaut.</p>
          {palettes.map((pal, pi) => (
            <PaletteEditor
              key={pal.id}
              pal={pal}
              first={pi === 0}
              edit={edit}
              set={(q) => setPalettes(palettes.map((x, j) => (j === pi ? q : x)))}
              remove={() => setPalettes(palettes.filter((_, j) => j !== pi))}
              makeFirst={() => setPalettes([pal, ...palettes.filter((_, j) => j !== pi)])}
            />
          ))}
          {edit && (
            <button className="pf-btn act-add" onClick={addPalette}>
              + Nouvelle variante
            </button>
          )}
          {!palettes.length && !edit && <p className="pf-note">Aucune variante pour l’instant.</p>}
          <div className="pf-group">Polices</div>
          <div className="act-row3">
            {(
              [
                ['title', 'Titres'],
                ['body', 'Texte'],
                ['accent', 'Accent'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="act-field">
                <small className="act-sub">{label}</small>
                <select className="pf-input" value={branding.fonts?.[k] ?? ''} disabled={!edit} onChange={(e) => setBranding({ fonts: { ...branding.fonts, [k]: e.target.value || undefined } })}>
                  <option value="">—</option>
                  {fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.family}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Field label="Raison d’être">
            <textarea className="pf-input act-purpose" rows={3} value={branding.purpose ?? ''} disabled={!edit} placeholder="Pourquoi cette activité existe, ce qu’elle veut faire ressentir…" onChange={(e) => setBranding({ purpose: e.target.value })} />
          </Field>
          <div className="pf-group">Mots-clés</div>
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
                placeholder="psyché, groove…"
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
          <div className="pf-group">Mentions récurrentes</div>
          <p className="pf-note">Textes prêts à poser : partenaires, réseaux, hashtags, billetterie… Chaque canal choisit les siennes.</p>
          {mentions.map((m, i) => (
            <div key={i} className="act-mention">
              <input className="pf-input" value={m.name} placeholder="Réseaux" disabled={!edit} onChange={(e) => setBranding({ mentions: mentions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Nom de la mention" />
              <textarea className="pf-input" rows={2} value={m.text} placeholder="@flowtherapy · flowtherapymusic.com" disabled={!edit} onChange={(e) => setBranding({ mentions: mentions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label="Texte" />
              {edit && (
                <button className="tm-remove" onClick={() => setBranding({ mentions: mentions.filter((_, j) => j !== i) })} title="Retirer">
                  ×
                </button>
              )}
            </div>
          ))}
          {edit && (
            <button className="pf-btn act-add" onClick={() => setBranding({ mentions: [...mentions, { name: '', text: '' }] })}>
              + Ajouter une mention
            </button>
          )}
        </div>
      )}
      {prof && tab === 'channels' && (
        <div className="pf-body">
          <p className="pf-note">Chaque média (Facebook, Instagram, affiche, lettre…) dit ses formats compatibles, sa marge, sa variante de couleurs, sa version du logo et ses mentions.</p>
          {channels.map((c, i) => (
            <ChannelCard
              key={c.id}
              c={c}
              edit={edit}
              open={openCh === c.id}
              toggle={() => setOpenCh(openCh === c.id ? null : c.id)}
              set={(x) => setChannel(i, x)}
              remove={() => set({ channels: channels.filter((_, j) => j !== i) })}
              mentions={mentions.map((m) => m.name).filter(Boolean)}
              palettes={palettes}
            />
          ))}
          {!channels.length && !edit && <p className="pf-note">Aucun média pour l’instant.</p>}
          {edit && (
            <button className="pf-btn act-add" onClick={addChannel}>
              + Ajouter un média
            </button>
          )}
        </div>
      )}
      {prof && tab === 'operations' && (
        <div className="pf-body">
          <p className="pf-note">Pour chaque occasion, les cibles cochées sont présélectionnées quand on crée un document.</p>
          {(prof.operations ?? []).map((o, i) => (
            <div key={o.id} className="act-pal">
              <div className="act-pal-head">
                <input className="pf-input act-pal-name" value={o.name} placeholder="Concert, évènement" disabled={!edit} onChange={(e) => setOperation(i, { ...o, name: e.target.value })} aria-label="Nom de l’occasion" />
                {edit && (
                  <button className="tm-remove" onClick={() => set({ operations: (prof.operations ?? []).filter((_, j) => j !== i) })} title="Retirer l’occasion">
                    ×
                  </button>
                )}
              </div>
              <div className="act-checks">
                {channels.flatMap((c) =>
                  formatsFor(c).map((fm) => {
                    const on = o.targets.some((t) => t.channel === c.id && t.format === fm.id);
                    return (
                      <label key={`${c.id}/${fm.id}`} className={`act-check ${on ? 'on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!edit}
                          onChange={() =>
                            setOperation(i, { ...o, targets: on ? o.targets.filter((t) => !(t.channel === c.id && t.format === fm.id)) : [...o.targets, { channel: c.id, format: fm.id }] })
                          }
                        />
                        {c.name} · {fm.title}
                      </label>
                    );
                  }),
                )}
              </div>
            </div>
          ))}
          {edit && (
            <button className="pf-btn act-add" onClick={() => set({ operations: [...(prof.operations ?? []), { id: `occasion-${Date.now().toString(36)}`, name: '', targets: [] }] })}>
              + Nouvelle occasion
            </button>
          )}
        </div>
      )}
      {prof && tab === 'services' && (
        <div className="pf-body">
          <LinkList title="Sources d’évènements" hint="Agenda, billetterie, page d’évènements : d’où viennent les dates à annoncer." placeholder="Bandsintown, agenda…" items={services.events ?? []} set={(v) => setServices('events', v)} edit={edit} />
          <LinkList title="Comptes de visuels" hint="Comptes qui fournissent photos et visuels (photographe, banque d’images, drive…)." placeholder="Google Photos, drive…" items={services.assets ?? []} set={(v) => setServices('assets', v)} edit={edit} />
          <p className="pf-note">Pour l’instant ce sont des repères ; les connexions automatiques viendront ensuite, service par service.</p>
        </div>
      )}
      {tab === 'members' && (
        <div className="pf-body">
          <MembersSection me={p.me} />
        </div>
      )}

      {err && <p className="pf-note pf-err">{err}</p>}
      {edit && tab !== 'members' && prof && (
        <div className="pf-acts act-save">
          <button className="pf-btn" onClick={p.onClose}>
            Annuler
          </button>
          <button className="pf-btn act-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
      {!edit && <p className="pf-note">Seuls les responsables modifient la fiche.</p>}
    </div>
  );
}
