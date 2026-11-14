import { describe, expect, it } from 'vitest';
import { addDays, addPlanRow, campaignFields, draftFromOperation, fillFields, filledCaption, hasFields, hourLabel, missingFields, patchStep, textModels, hashtagChoices, hashtagOf, planCaption, toggleHashtag, planFromOperation, planSteps, stepsOf } from '../src/plan';
import type { Campaign, PlanItem } from '../src/server';
import { DEFAULT_OPERATIONS } from '../src/targets';

const concert = DEFAULT_OPERATIONS.find((o) => o.id === 'concert')!;

describe('plan de publication', () => {
  it('compte les jours par-dessus les mois', () => {
    expect(addDays('2026-12-12', -21)).toBe('2026-11-21');
    expect(addDays('2026-03-02', -3)).toBe('2026-02-27');
  });

  it('préremplit un concert en étapes nommées : annonce trois semaines avant, rappel, story à dater', () => {
    expect(planFromOperation(concert, '2026-12-12', null)).toEqual([
      { id: 'annonce-affiche-a4', channel: 'affiche', format: 'a4', label: 'Annonce', step: 'annonce', date: '2026-11-21' },
      { id: 'annonce-facebook-carre', channel: 'facebook', format: 'carre', label: 'Annonce', step: 'annonce', date: '2026-11-21' },
      { id: 'rappel-facebook-carre', channel: 'facebook', format: 'carre', label: 'Rappel', step: 'rappel', date: '2026-12-09' },
      { id: 'story-instagram-story', channel: 'instagram', format: 'story', label: 'Story', step: 'story' },
    ]);
  });

  it('sans date, les étapes restent, à dater', () => {
    const plan = planFromOperation(concert, undefined, null);
    expect(plan.map((x) => x.date)).toEqual([undefined, undefined, undefined, undefined]);
    expect(planSteps(plan).map((s) => s.name)).toEqual(['Annonce', 'Rappel', 'Story']);
  });

  it('suit les étapes décrites par le type de projet, sans les publications qu’il n’a plus', () => {
    const op = { ...concert, steps: [{ name: 'Teaser', days: 30, targets: [{ channel: 'instagram', format: 'story' }, { channel: 'x', format: 'carre' }] }, { name: 'Vide', targets: [{ channel: 'x', format: 'carre' }] }] };
    expect(stepsOf(op, null)).toEqual([{ name: 'Teaser', days: 30, targets: [{ channel: 'instagram', format: 'story' }] }]);
    expect(planFromOperation(op, '2026-12-12', null)).toEqual([{ id: 'teaser-instagram-story', channel: 'instagram', format: 'story', label: 'Teaser', step: 'teaser', date: '2026-11-12' }]);
  });

  it('range un plan d’avant les étapes par date et par nom, puis garde le groupe quand on le renomme', () => {
    const old: PlanItem[] = [
      { id: 'fb-rappel', channel: 'facebook', format: 'carre', label: 'rappel', date: '2026-12-09' },
      { id: 'a4', channel: 'affiche', format: 'a4', date: '2026-11-21' },
      { id: 'fb', channel: 'facebook', format: 'carre', date: '2026-11-21' },
      { id: 'story', channel: 'instagram', format: 'story' },
    ];
    const steps = planSteps(old);
    expect(steps.map((s) => [s.name, s.date, s.rows.map((r) => r.id)])).toEqual([['', '2026-11-21', ['a4', 'fb']], ['rappel', '2026-12-09', ['fb-rappel']], ['', undefined, ['story']]]);
    const named = patchStep(old, steps[0]!.key, { label: 'Annonce', date: '2026-11-20' });
    expect(planSteps(named)[0]).toMatchObject({ name: 'Annonce', date: '2026-11-20', rows: [{ id: 'a4', step: 'etape' }, { id: 'fb', step: 'etape' }] });
    // une publication de plus dans l'étape en prend le nom et la date
    const more = addPlanRow(named, { channel: 'instagram', format: 'carre' }, planSteps(named)[0]);
    expect(more.at(-1)).toEqual({ id: 'etape-instagram-carre', channel: 'instagram', format: 'carre', step: 'etape', label: 'Annonce', date: '2026-11-20' });
    // une étape nouvelle ne se mêle à aucune autre
    expect(planSteps(addPlanRow(more, { format: 'a4' })).length).toBe(4);
  });

  it('dépose une composition sur les seules publications libres d’une étape', () => {
    const plan: PlanItem[] = [
      { id: 'a', format: 'a4', step: 's', published: '2026-11-01T10:00:00Z', composition: 'vieille' },
      { id: 'b', format: 'carre', step: 's' },
    ];
    expect(patchStep(plan, 's', { composition: 'neuve' }, (it) => !it.published).map((x) => x.composition)).toEqual(['vieille', 'neuve']);
  });

  it('envoie le texte déposé sur l’étape, sinon celui de la composition, sinon celui de la campagne', () => {
    const c = { id: 'c', name: 'C', created: '', caption: 'Venez !', link: 'https://billets.example', hashtags: '#concert', texts: [{ id: 'rappel', name: 'Rappel', text: 'C’est samedi.' }] } as Campaign;
    expect(planCaption(c, { id: 'x', format: 'carre', text: 'rappel' }, 'Texte de la composition')).toBe('C’est samedi.\n\nhttps://billets.example\n\n#concert');
    expect(planCaption(c, { id: 'x', format: 'carre' }, 'Texte de la composition')).toBe('Texte de la composition');
    expect(planCaption(c, { id: 'x', format: 'carre', text: 'disparu' })).toBe('Venez !\n\nhttps://billets.example\n\n#concert');
    // le texte principal déposé sur l'étape passe devant celui de la composition
    expect(planCaption(c, { id: 'x', format: 'carre', text: 'main' }, 'Texte de la composition')).toBe('Venez !\n\nhttps://billets.example\n\n#concert');
  });

  it('propose les mots-dièse de l’activité et les pose ou retire d’un toucher', () => {
    expect(hashtagOf('Rock progressif')).toBe('#rockprogressif');
    expect(hashtagOf('#Psyché')).toBe('#psyché');
    expect(hashtagOf(' , ')).toBe('');
    expect(hashtagChoices('Flowtherapy', ['psyché', 'Rock progressif', '#flowtherapy'], ['#concert #RisOrangis', undefined, '#psyché'])).toEqual(['#flowtherapy', '#psyché', '#rockprogressif', '#concert', '#risorangis']);
    expect(toggleHashtag('', '#psyché')).toBe('#psyché');
    expect(toggleHashtag('#concert', '#psyché')).toBe('#concert #psyché');
    expect(toggleHashtag('#concert #Psyché #live', '#psyché')).toBe('#concert #live');
    // le mot en cours de frappe est complété, pas doublé
    expect(toggleHashtag('#concert #ps', '#psyché')).toBe('#concert #psyché');
    expect(toggleHashtag('#concert ps', '#psyché')).toBe('#concert #psyché');
    expect(toggleHashtag('#concert', '#concertlive')).toBe('#concertlive');
  });

  it('remplit les champs de la campagne dans un texte, pour le jour de l’envoi', () => {
    const c = { id: 'c', name: 'Concert au Plan', created: '', date: '2026-12-12', time: '19:30', place: 'Le Plan', kind: 'Concert', caption: '{campagne}, {quand} !', link: 'https://billets.example', texts: [{ id: 'rappel', name: 'Rappel', text: 'C’est {Quand} : {date} à {heure}, {lieu}. {inconnu} {contact}' }] } as Campaign;
    const f = campaignFields(c, 'Flowtherapy', '2026-12-09');
    expect(Object.fromEntries(f.map((x) => [x.key, x.value]))).toMatchObject({ campagne: 'Concert au Plan', date: 'samedi 12 décembre', jour: 'samedi', heure: '19h30', lieu: 'Le Plan', quand: 'dans 3 jours', jours: '3', type: 'Concert', activité: 'Flowtherapy' });
    expect(campaignFields({ ...c, date: '2026-12-01', time: '20:00' }, undefined, '2026-11-30').filter((x) => ['date', 'heure', 'quand'].includes(x.key)).map((x) => x.value)).toEqual(['mardi 1er décembre', '20h', 'demain']);
    // champ inconnu laissé tel quel, clé sans accent ni casse, champ sans valeur laissé visible et signalé
    expect(fillFields('{Activite} · {lieu} · {inconnu}', f)).toBe('Flowtherapy · Le Plan · {inconnu}');
    const bare = campaignFields({ ...c, place: undefined, date: undefined }, 'Flowtherapy');
    expect(fillFields('{lieu}, {date}', bare)).toBe('{lieu}, {date}');
    expect(missingFields('{lieu}, {Date}, {inconnu}, {campagne}', bare)).toEqual(['{lieu}', '{date}']);
    expect(hasFields('Bonjour {inconnu}', f)).toBe(false);
    expect(hasFields('Bonjour {lieu}', f)).toBe(true);
    // à l'envoi : le texte de l'étape rempli pour la date de la ligne, puis le lien
    expect(planCaption(c, { id: 'x', format: 'carre', text: 'rappel', date: '2026-12-09' }, undefined, 'Flowtherapy')).toBe('C’est dans 3 jours : samedi 12 décembre à 19h30, Le Plan. {inconnu} {contact}\n\nhttps://billets.example');
    expect(planCaption(c, { id: 'x', format: 'carre', date: '2026-12-11' })).toBe('Concert au Plan, demain !\n\nhttps://billets.example');
    expect(filledCaption(c, 'Flowtherapy', '2026-12-12')).toBe('Concert au Plan, aujourd’hui !\n\nhttps://billets.example');
  });

  it('tire du type de projet les étapes, leurs modèles de texte et les modèles proposés', () => {
    const op = { id: 'concert', name: 'Concert', targets: [{ channel: 'facebook', format: 'carre' }, { channel: 'instagram', format: 'carre' }], steps: [{ name: 'Annonce', days: 21, targets: [{ channel: 'facebook', format: 'carre' }, { channel: 'instagram', format: 'carre' }], text: '{campagne} : {date}' }, { name: 'Main', days: 3, targets: [{ channel: 'facebook', format: 'carre' }], text: 'Dernier rappel' }, { name: 'Bilan', targets: [{ channel: 'facebook', format: 'carre' }] }] };
    const d = draftFromOperation(op, '2026-12-12', null);
    // « main » est réservé au texte principal : le texte de l'étape « Main » prend un autre identifiant
    expect(d.texts).toEqual([{ id: 'annonce', name: 'Annonce', text: '{campagne} : {date}' }, { id: 'main-2', name: 'Main', text: 'Dernier rappel' }]);
    expect(d.plan.map((x) => [x.step, x.date, x.text])).toEqual([['annonce', '2026-11-21', 'annonce'], ['annonce', '2026-11-21', 'annonce'], ['main', '2026-12-09', 'main-2'], ['bilan', undefined, undefined]]);
    expect(planFromOperation(op, '2026-12-12', null)).toEqual(d.plan);
    expect(textModels(op).map((m) => m.name)).toEqual(['Annonce', 'Main', 'Rappel', 'Merci']);
    expect(textModels(op)[0]!.text).toBe('{campagne} : {date}');
    expect(textModels().map((m) => m.name)).toEqual(['Annonce', 'Rappel', 'Merci']);
  });

  it('donne une heure à l’étape, reprise par ses lignes et par le type de projet', () => {
    const plan: PlanItem[] = [
      { id: 'a', channel: 'facebook', format: 'carre', step: 's', label: 'Rappel', date: '2026-12-09' },
      { id: 'b', channel: 'instagram', format: 'carre', step: 's', label: 'Rappel', date: '2026-12-09' },
      { id: 'c', channel: 'facebook', format: 'carre', step: 'matin', label: 'Matin', date: '2026-12-09', time: '08:00' },
    ];
    const timed = patchStep(plan, 's', { time: '18:30' });
    expect(timed.map((x) => x.time)).toEqual(['18:30', '18:30', '08:00']);
    // le même jour, l'étape du matin passe devant ; sans heure une étape compte pour 10 h
    expect(planSteps(timed).map((s) => [s.name, s.time])).toEqual([['Matin', '08:00'], ['Rappel', '18:30']]);
    expect(planSteps(plan).map((s) => s.name)).toEqual(['Matin', 'Rappel']);
    expect(addPlanRow(timed, { channel: 'facebook', format: 'banniere' }, planSteps(timed)[1]).at(-1)).toMatchObject({ step: 's', date: '2026-12-09', time: '18:30' });
    expect(patchStep(timed, 's', { time: undefined }).map((x) => x.time)).toEqual([undefined, undefined, '08:00']);
    const op = { id: 'o', name: 'O', targets: [{ channel: 'facebook', format: 'carre' }], steps: [{ name: 'Annonce', days: 21, time: '18:00', targets: [{ channel: 'facebook', format: 'carre' }] }] };
    expect(draftFromOperation(op, '2026-12-12', null).plan[0]).toMatchObject({ date: '2026-11-21', time: '18:00' });
    expect([hourLabel('18:30'), hourLabel('09:00'), hourLabel(undefined)]).toEqual(['18h30', '9h', '']);
  });
});
