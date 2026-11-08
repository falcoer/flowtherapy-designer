import { describe, expect, it } from 'vitest';
import { addDays, planFromOperation } from '../src/campaign-sheet';
import { DEFAULT_OPERATIONS } from '../src/targets';

describe('plan de publication', () => {
  it('compte les jours par-dessus les mois', () => {
    expect(addDays('2026-12-12', -21)).toBe('2026-11-21');
    expect(addDays('2026-03-02', -3)).toBe('2026-02-27');
  });

  it('préremplit un concert : affiche et post trois semaines avant, story sans date, un rappel', () => {
    const concert = DEFAULT_OPERATIONS.find((o) => o.id === 'concert');
    expect(planFromOperation(concert, '2026-12-12', null)).toEqual([
      { id: 'affiche-a4', channel: 'affiche', format: 'a4', date: '2026-11-21' },
      { id: 'facebook-carre', channel: 'facebook', format: 'carre', date: '2026-11-21' },
      { id: 'instagram-story', channel: 'instagram', format: 'story' },
      { id: 'facebook-rappel', channel: 'facebook', format: 'carre', label: 'rappel', date: '2026-12-09' },
    ]);
  });

  it('sans date, les rendus sans date et pas de rappel', () => {
    const concert = DEFAULT_OPERATIONS.find((o) => o.id === 'concert');
    expect(planFromOperation(concert, undefined, null).map((x) => x.date)).toEqual([undefined, undefined, undefined]);
  });
});
