import { describe, expect, it } from 'vitest';
import { addDays, addPlanRow, patchStep, hashtagChoices, hashtagOf, planCaption, toggleHashtag, planFromOperation, planSteps, stepsOf } from '../src/plan';
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
});
