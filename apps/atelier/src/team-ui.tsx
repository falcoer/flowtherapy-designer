import { useEffect, useState } from 'react';
import { createTeam, fetchMembers, inviteMember, removeMember, ROLE_LABELS, setMemberRole, switchTeam, type Me, type Member, type Role } from './server';

const ROLES: Role[] = ['owner', 'editor', 'viewer'];

/**
 * Préférences › Compte : l'équipe active (ses compositions et ses objets), ses membres,
 * et pour les responsables les invitations et les rôles.
 */
export function TeamSection({ me }: { me: Me }) {
  const team = me.team;
  const owner = team?.role === 'owner';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [removing, setRemoving] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState('');
  const [info, setInfo] = useState<string | null>(null);

  const load = () => {
    if (!team) return;
    fetchMembers(team.id).then(setMembers, (e: Error) => setErr(e.message));
  };
  useEffect(load, [team?.id]);

  const run = async (f: () => Promise<unknown>) => {
    setErr(null);
    try {
      await f();
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  // changer d'équipe change toutes les compositions visibles : on recharge l'atelier
  const pick = (id: string) => void switchTeam(id).then(() => location.reload(), (e: Error) => setErr(e.message));

  if (!team) return <p className="pf-note">Tu ne fais partie d'aucune équipe. Demande à un responsable de t'inviter.</p>;
  const teams = [...(me.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const self = me.email?.toLowerCase();

  return (
    <>
      <div className="pf-group">Équipe</div>
      {teams.length > 1 ? (
        <select className="pf-input" value={team.id} onChange={(e) => pick(e.target.value)} aria-label="Équipe active">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {ROLE_LABELS[t.role]}
            </option>
          ))}
        </select>
      ) : (
        <dl className="pf-dl">
          <dt>Équipe</dt>
          <dd>{team.name}</dd>
          <dt>Rôle</dt>
          <dd>{ROLE_LABELS[team.role]}</dd>
        </dl>
      )}
      <p className="pf-note">Les compositions et les objets enregistrés sont partagés par toute l'équipe.</p>

      <div className="pf-group">Membres</div>
      {!members && !err && <p className="pf-note">Chargement…</p>}
      {members && (
        <div className="tm-list">
          {members.map((m) => (
            <div key={m.email} className="tm-row">
              <span className="pf-avatar tm-avatar">{(m.name ?? m.email).slice(0, 1).toUpperCase()}</span>
              <span className="pf-txt">
                <b>{m.name ?? m.email}</b>
                <small>
                  {m.name ? m.email : ''}
                  {!m.joined && <em className="tm-pending">{m.name ? ' · ' : ''}invitation en attente</em>}
                </small>
              </span>
              {owner ? (
                <>
                  <select className="tm-role" value={m.role} onChange={(e) => void run(() => setMemberRole(team.id, m.email, e.target.value as Role))} aria-label={`Rôle de ${m.email}`}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {m.email !== self && (
                    <button
                      className={`tm-remove ${removing === m.email ? 'armed' : ''}`}
                      title={removing === m.email ? 'Toucher encore pour retirer' : 'Retirer de l’équipe'}
                      onClick={() => {
                        if (removing !== m.email) return setRemoving(m.email);
                        setRemoving(null);
                        void run(() => removeMember(team.id, m.email));
                      }}
                    >
                      {removing === m.email ? 'Retirer ?' : '×'}
                    </button>
                  )}
                </>
              ) : (
                <span className="tm-badge">{ROLE_LABELS[m.role]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {owner && (
        <form
          className="tm-invite"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            void run(async () => {
              const r = await inviteMember(team.id, email.trim(), role);
              setEmail('');
              setInfo(r.mailed ? `Invitation envoyée par e-mail à ${r.member.email}.` : `${r.member.email} est ajouté ; préviens-le toi-même (aucun e-mail envoyé).`);
            });
          }}
        >
          <input className="pf-input" type="email" placeholder="adresse@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Adresse à inviter" />
          <select className="tm-role" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Rôle de l'invité">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button className="pf-btn" type="submit" disabled={!email.trim()}>
            Inviter
          </button>
        </form>
      )}
      {owner && info && <p className="pf-note">{info}</p>}
      {owner && !info && (
        <p className="pf-note">
          L'invité entre avec le compte Google (ou Apple) de cette adresse.{' '}
          {me.mail ? 'Il reçoit un e-mail avec le lien.' : "Aucun e-mail n'est envoyé : préviens-le toi-même."}
        </p>
      )}

      {me.admin && (
        <>
          <div className="pf-group">Nouvelle équipe</div>
          <form
            className="tm-invite"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTeam.trim()) return;
              void createTeam(newTeam.trim()).then(
                (r) => pick(r.team.id),
                (e: Error) => setErr(e.message),
              );
            }}
          >
            <input className="pf-input" placeholder="Nom de l'équipe" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} aria-label="Nom de la nouvelle équipe" />
            <button className="pf-btn" type="submit" disabled={!newTeam.trim()}>
              Créer
            </button>
          </form>
        </>
      )}
      {err && <p className="pf-note pf-err">{err}</p>}
    </>
  );
}
