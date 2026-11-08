import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { createTeam, fetchProfile, ROLE_LABELS, saveProfile, switchTeam, type ActivityProfile, type Me, type ServiceLink, type TeamRef } from './server';
import { MembersSection } from './team-ui';

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

type FormTab = 'identity' | 'services' | 'branding' | 'members';

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
  const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
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

/** Fiche de l'activité : identité, services, branding, membres. Les responsables la modifient. */
export function ActivityForm(p: { me: Me; onClose: () => void; onSaved: () => void }) {
  const team = p.me.team!;
  const edit = team.role === 'owner';
  const [tab, setTab] = useState<FormTab>('identity');
  const [prof, setProf] = useState<ActivityProfile | null>(null);
  const [logo, setLogo] = useState<string | null | undefined>(undefined); // undefined : inchangé
  const [kw, setKw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProfile(team.id).then(setProf, (e: Error) => setErr(e.message));
  }, [team.id]);

  const set = (patch: Partial<ActivityProfile>) => setProf((x) => (x ? { ...x, ...patch } : x));
  const services = prof?.services ?? {};
  const branding = prof?.branding ?? {};
  const setServices = (k: keyof NonNullable<ActivityProfile['services']>, v: ServiceLink[]) => set({ services: { ...services, [k]: v } });
  const setBranding = (patch: Partial<NonNullable<ActivityProfile['branding']>>) => set({ branding: { ...branding, ...patch } });
  const palette = branding.palette ?? [];
  const keywords = branding.keywords ?? [];
  const addKeywords = (text: string) => {
    const add = text
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && !keywords.includes(k));
    if (add.length) setBranding({ keywords: [...keywords, ...add] });
    setKw('');
  };

  const save = async () => {
    if (!prof) return;
    setBusy(true);
    setErr(null);
    try {
      const pending = kw.trim() ? [...keywords, ...kw.split(',').map((k) => k.trim()).filter(Boolean)] : keywords;
      const { id: _id, ...rest } = prof;
      await saveProfile(team.id, { ...rest, branding: { ...branding, keywords: pending }, ...(logo !== undefined ? { logo } : {}) });
      p.onSaved();
      p.onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shownLogo = logo === undefined ? team.logo : logo;

  return (
    <div className="bubble act-form" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pf-head">
        <span className="b-title">Fiche de l’activité</span>
        <button className="lamp-close" onClick={p.onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="seg pf-tabs" role="tablist">
        {(
          [
            ['identity', 'Identité'],
            ['services', 'Services'],
            ['branding', 'Branding'],
            ['members', 'Membres'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {!prof && !err && <p className="pf-note">Chargement…</p>}
      {prof && tab === 'identity' && (
        <div className="pf-body">
          <div className="act-identity">
            <label className={`act-logo ${edit ? 'editable' : ''}`} title={edit ? 'Choisir un logo' : undefined}>
              <ActivityMark team={{ name: prof.name || team.name, logo: shownLogo ?? undefined }} size={88} />
              {edit && (
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void logoFromFile(f).then(setLogo, (x: Error) => setErr(x.message));
                    e.target.value = '';
                  }}
                />
              )}
            </label>
            <div className="act-fields">
              <label className="act-field">
                <span className="pf-group">Nom</span>
                <input className="pf-input" value={prof.name} disabled={!edit} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="act-field">
                <span className="pf-group">Type d’activité</span>
                <input className="pf-input" list="act-kinds" value={prof.kind ?? ''} placeholder="Groupe musical" disabled={!edit} onChange={(e) => set({ kind: e.target.value })} />
                <datalist id="act-kinds">
                  {KINDS.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </label>
            </div>
          </div>
          {edit && (
            <p className="pf-note">
              Touche le logo pour en choisir un (PNG, JPEG, SVG).{' '}
              {shownLogo && (
                <button className="ab-link" onClick={() => setLogo(null)}>
                  Retirer le logo
                </button>
              )}
            </p>
          )}
        </div>
      )}
      {prof && tab === 'services' && (
        <div className="pf-body">
          <LinkList title="Sources d’évènements" hint="Agenda, billetterie, page d’évènements : d’où viennent les dates à annoncer." placeholder="Bandsintown, agenda…" items={services.events ?? []} set={(v) => setServices('events', v)} edit={edit} />
          <LinkList title="Comptes de visuels" hint="Comptes qui fournissent photos et visuels (photographe, banque d’images, drive…)." placeholder="Google Photos, drive…" items={services.assets ?? []} set={(v) => setServices('assets', v)} edit={edit} />
          <LinkList title="Publication" hint="Où partent les supports : réseaux sociaux, site, lettre d’information." placeholder="Instagram, Facebook…" items={services.publishing ?? []} set={(v) => setServices('publishing', v)} edit={edit} />
          <p className="pf-note">Pour l’instant ce sont des repères ; les connexions automatiques viendront ensuite, service par service.</p>
        </div>
      )}
      {prof && tab === 'branding' && (
        <div className="pf-body">
          <div className="pf-group">Palette</div>
          <div className="act-palette">
            {palette.map((c, i) => (
              <div key={i} className="act-swatch">
                <label className="act-chip" style={{ background: c.hex }} title={c.hex}>
                  {edit && <input type="color" value={c.hex} onChange={(e) => setBranding({ palette: palette.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)) })} />}
                </label>
                <input className="act-cname" value={c.name ?? ''} placeholder={c.hex} disabled={!edit} onChange={(e) => setBranding({ palette: palette.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Nom de la couleur" />
                {edit && (
                  <button className="tm-remove" onClick={() => setBranding({ palette: palette.filter((_, j) => j !== i) })} title="Retirer">
                    ×
                  </button>
                )}
              </div>
            ))}
            {edit && (
              <button className="act-chip act-chip-add" onClick={() => setBranding({ palette: [...palette, { hex: '#888888' }] })} title="Ajouter une couleur">
                +
              </button>
            )}
          </div>
          <label className="act-field">
            <span className="pf-group">Raison d’être</span>
            <textarea className="pf-input act-purpose" rows={4} value={branding.purpose ?? ''} disabled={!edit} placeholder="Pourquoi cette activité existe, ce qu’elle veut faire ressentir…" onChange={(e) => setBranding({ purpose: e.target.value })} />
          </label>
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
