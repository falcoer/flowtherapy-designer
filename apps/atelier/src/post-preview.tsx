import { useState, type ReactNode } from 'react';
import type { Channel } from './server';
import { MediaIcon } from './targets-ui';

/*
 * L'aperçu d'un envoi tel que le média le montrera : sur Facebook le texte au-dessus de l'image, sur
 * Instagram l'image puis la légende coupée, une story sans texte, une affiche à imprimer sans texte.
 * Une esquisse, pas une copie de l'écran du réseau : elle montre l'ordre, la coupe et la longueur.
 */
export type MediaLook = 'feed' | 'instagram' | 'story' | 'print';
const idOf = (ch?: Channel, id?: string) => `${ch?.id ?? id ?? ''} ${ch?.name ?? ''}`.toLowerCase();
const SOCIAL = /facebook|instagram|linkedin|threads|bluesky|mastodon|tiktok|pinterest|twitter|\bx\b/;
/** `id` : le média de la ligne quand l'activité ne le décrit plus, reconnu à son nom. */
export function mediaLook(ch: Channel | undefined, format: string, id?: string): MediaLook {
  if (/story|reel|short/.test(format)) return 'story';
  if (!(ch ? ch.kind === 'social' : SOCIAL.test(idOf(ch, id)))) return 'print';
  return idOf(ch, id).includes('instagram') ? 'instagram' : 'feed';
}
/** Longueur de texte acceptée par le réseau, quand il en a une courte ; et où il coupe le texte dans le fil. */
const LIMITS: Array<[RegExp, number]> = [
  [/\bx\b|twitter/, 280],
  [/bluesky/, 300],
  [/threads|mastodon|pinterest/, 500],
  [/instagram|tiktok/, 2200],
  [/linkedin/, 3000],
];
export const textLimit = (ch?: Channel, id?: string): number | undefined => LIMITS.find(([re]) => re.test(idOf(ch, id)))?.[1];
const FOLD: Record<MediaLook, number> = { feed: 480, instagram: 125, story: 0, print: 0 };

/** Le texte avec ses liens et mots-dièse en couleur, et les champs restés vides signalés. */
export function richText(text: string): ReactNode[] {
  return text.split(/(https?:\/\/\S+|#[\p{L}\p{N}_]+|\{[^{}\n]{1,24}\})/gu).map((part, i) =>
    /^https?:\/\//.test(part) || part.startsWith('#') ? (
      <span key={i} className="pv-link">
        {part}
      </span>
    ) : /^\{.+\}$/.test(part) ? (
      <mark key={i} className="pv-hole" title="Champ sans valeur dans les paramètres de la campagne">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function PostPreview(p: {
  channel?: Channel;
  /** le média de la ligne, quand l'activité ne le décrit plus */
  channelId?: string;
  format: string;
  /** qui publie : le compte relié, sinon l'activité */
  account: string;
  image?: string;
  /** largeur / hauteur du format */
  ratio: number;
  text: string;
  /** « 9 déc. à 10:00 », « maintenant »… */
  when?: string;
  onImage?: () => void;
}) {
  const look = mediaLook(p.channel, p.format, p.channelId);
  const [all, setAll] = useState(false);
  const fold = FOLD[look];
  const cut = !all && fold > 0 && p.text.length > fold + 20;
  const shown = cut ? `${p.text.slice(0, fold).trimEnd()}…` : p.text;
  const limit = textLimit(p.channel, p.channelId);
  const over = look !== 'story' && look !== 'print' && limit !== undefined && p.text.length > limit;
  const more = cut && (
    <button className="pv-more" onClick={() => setAll(true)}>
      {look === 'instagram' ? 'plus' : 'Voir plus'}
    </button>
  );
  const picture = (
    <button className={`pv-img ${p.image ? '' : 'none'}`} style={{ aspectRatio: `${Math.min(1.91, Math.max(0.5625, p.ratio))}` }} onClick={p.onImage} disabled={!p.onImage || !p.image} title={p.image && p.onImage ? 'Ouvrir la composition' : undefined}>
      {p.image ? <img src={p.image} alt="" loading="lazy" draggable={false} /> : <span>pas encore de composition</span>}
    </button>
  );
  const head = (
    <div className="pv-head">
      <span className="pv-avatar" aria-hidden>
        {p.account.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="pv-who">
        <b>{p.account}</b>
        {p.when && <small>{p.when}</small>}
      </span>
      <MediaIcon ch={p.channel} size={16} />
    </div>
  );
  return (
    <div className={`pv pv-${look}`}>
      {look === 'story' ? (
        <>
          <div className="pv-story">
            {picture}
            {head}
          </div>
          <small className="pv-note">Une story part sans texte : seule l’image est envoyée.</small>
        </>
      ) : look === 'print' ? (
        <>
          {picture}
          <small className="pv-note">À imprimer ou à déposer : l’image seule, sans texte.</small>
        </>
      ) : look === 'instagram' ? (
        <>
          {head}
          {picture}
          <p className="pv-text">
            <b>{p.account.toLowerCase().replace(/\s+/g, '')}</b> {p.text ? richText(shown) : <em>pas de texte</em>} {more}
          </p>
        </>
      ) : (
        <>
          {head}
          <p className="pv-text">
            {p.text ? richText(shown) : <em>pas de texte</em>} {more}
          </p>
          {picture}
        </>
      )}
      {over && (
        <small className="pv-warn">
          {p.text.length} caractères : {p.channel?.name ?? p.channelId ?? 'ce réseau'} en accepte {limit}.
        </small>
      )}
    </div>
  );
}
