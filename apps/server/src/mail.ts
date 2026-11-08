import nodemailer from 'nodemailer';
import type { Role } from './accounts.js';

/**
 * Envoi d'e-mails (invitations, propositions de supports) par un relais SMTP, Brevo en production.
 * Sans configuration, rien n'est envoyé et l'application le dit.
 */

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Lit FTD_SMTP_* ; null si l'envoi n'est pas configuré. */
export function mailerFromEnv(env = process.env): Mailer | null {
  const { FTD_SMTP_HOST, FTD_SMTP_PORT, FTD_SMTP_USER, FTD_SMTP_PASSWORD, FTD_MAIL_FROM } = env;
  if (!FTD_SMTP_HOST) return null;
  if (!FTD_SMTP_USER || !FTD_SMTP_PASSWORD || !FTD_MAIL_FROM) {
    throw new Error('E-mails : FTD_SMTP_USER, FTD_SMTP_PASSWORD et FTD_MAIL_FROM sont requis avec FTD_SMTP_HOST.');
  }
  const port = Number(FTD_SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: FTD_SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: FTD_SMTP_USER, pass: FTD_SMTP_PASSWORD },
  });
  return {
    async send(m) {
      await transport.sendMail({ from: FTD_MAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html, ...(m.replyTo ? { replyTo: m.replyTo } : {}) });
    },
  };
}

/* ---------- modèles ---------- */

const ROLE_TEXT: Record<Role, string> = {
  owner: 'responsable (tu pourras inviter d’autres membres)',
  editor: 'membre (tu pourras créer et modifier les compositions)',
  viewer: 'lecteur (tu pourras consulter et exporter les compositions)',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], button: { label: string; url: string }, footer: string) {
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#ecebe7;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1b22">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7a7488">FT Designer</div>
<h1 style="font-size:20px;margin:8px 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join('\n')}
<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1d1b22;color:#fff;text-decoration:none;font-weight:600">${esc(button.label)}</a></p>
<p style="margin:0;font-size:12.5px;color:#7a7488">${footer}</p>
</div></body></html>`;
  return html;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));

export function invitationMail(o: { to: string; team: string; role: Role; inviter?: { email: string; name?: string }; url: string }): Mail {
  const who = o.inviter ? esc(o.inviter.name ?? o.inviter.email) : 'Un responsable';
  const paras = [
    `${who} t’invite dans l’équipe <b>${esc(o.team)}</b> sur FT Designer, l’atelier de composition des affiches et publications.`,
    `Tu y entres comme ${esc(ROLE_TEXT[o.role])}.`,
    `Connecte-toi avec le compte Google (ou Apple) de cette adresse : <b>${esc(o.to)}</b>.`,
  ];
  const footer = 'Si tu ne t’attendais pas à cette invitation, ignore simplement ce message.';
  return {
    to: o.to,
    subject: `Invitation dans l’équipe ${o.team} · FT Designer`,
    html: layout(`Bienvenue dans l’équipe ${o.team}`, paras, { label: 'Ouvrir FT Designer', url: o.url }, footer),
    text: [...paras.map(strip), '', `Ouvrir FT Designer : ${o.url}`, '', footer].join('\n'),
    ...(o.inviter ? { replyTo: o.inviter.email } : {}),
  };
}

export function proposalMail(o: { to: string[]; team: string; title: string; by: { email: string; name?: string }; note?: string; url: string }): Mail {
  const who = esc(o.by.name ?? o.by.email);
  const paras = [
    `${who} propose un nouveau support dans l’équipe <b>${esc(o.team)}</b> : <b>« ${esc(o.title)} »</b>.`,
    ...(o.note ? [`Son message : <i>${esc(o.note)}</i>`] : []),
    'Ouvre-le pour le valider ou demander une retouche.',
  ];
  const footer = 'Tu reçois ce message parce que tu es responsable de cette équipe.';
  return {
    to: o.to,
    subject: `Nouveau support proposé : ${o.title} · ${o.team}`,
    html: layout('Nouveau support à valider', paras, { label: 'Voir la proposition', url: o.url }, footer),
    text: [...paras.map(strip), '', `Voir la proposition : ${o.url}`, '', footer].join('\n'),
    replyTo: o.by.email,
  };
}

export function reviewMail(o: { to: string; team: string; title: string; by: { email: string; name?: string }; approved: boolean; note?: string; url: string }): Mail {
  const who = esc(o.by.name ?? o.by.email);
  const paras = [
    o.approved ? `${who} a <b>validé</b> « ${esc(o.title)} » dans l’équipe <b>${esc(o.team)}</b>.` : `${who} demande une <b>retouche</b> sur « ${esc(o.title)} » dans l’équipe <b>${esc(o.team)}</b>.`,
    ...(o.note ? [`Son message : <i>${esc(o.note)}</i>`] : []),
  ];
  const footer = 'Tu reçois ce message parce que tu as proposé ce support.';
  return {
    to: o.to,
    subject: `${o.approved ? 'Validé' : 'À revoir'} : ${o.title} · ${o.team}`,
    html: layout(o.approved ? 'Support validé' : 'Retouche demandée', paras, { label: 'Ouvrir la composition', url: o.url }, footer),
    text: [...paras.map(strip), '', `Ouvrir la composition : ${o.url}`, '', footer].join('\n'),
    replyTo: o.by.email,
  };
}
