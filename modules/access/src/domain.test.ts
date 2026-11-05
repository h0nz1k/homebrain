import { describe, expect, it } from 'vitest';
import { createSyntheticUsers } from './api';
import {
  enrolledAgoCs,
  enrolledShortCs,
  findDuplicates,
  groupPeople,
  monthsSince,
  reasonCs,
  serviceRemaining,
  topIssue,
  wifiQuality,
} from './domain';

const NOW = new Date('2026-11-04T12:00:00').getTime();

describe('groupPeople', () => {
  it('groups IDs by person and sorts hands by label', () => {
    const people = groupPeople(
      createSyntheticUsers(),
      { '1001': { hand: 'right' }, '1003': { hand: 'right' } },
      { tomáš: { child: true } },
    );
    expect(people.map((p) => p.name)).toEqual(['Jan', 'Petra', 'Tomáš']);
    const jan = people[0]!;
    expect(jan.face.map((u) => u.id)).toEqual([1]);
    expect(jan.right.map((u) => u.id)).toEqual([1001]);
    expect(jan.unknown.map((u) => u.id)).toEqual([1002]);
    expect(people[2]!.allowed).toBe(false);
    expect(people[2]!.child).toBe(true);
  });
  it('label person overrides sensor name', () => {
    const people = groupPeople(createSyntheticUsers(), { '1003': { person: 'Jan', hand: 'left' } });
    expect(people.find((p) => p.name === 'Jan')!.left.map((u) => u.id)).toEqual([1003]);
  });
});

describe('issues', () => {
  it('prefers duplicates, then unknown hands, then missing palms', () => {
    const users = createSyntheticUsers();
    const dup = groupPeople(users, { '1001': { hand: 'right' }, '1002': { hand: 'right' } });
    expect(findDuplicates(dup)).toEqual([
      { person: 'Jan', hand: 'right', ids: [1001, 1002], extra: 1002 },
    ]);
    expect(topIssue(dup).title).toContain('dvakrát');
    expect(topIssue(groupPeople(users, { '1001': { hand: 'right' } })).title).toContain(
      'neurčená dlaň',
    );
    const ok = groupPeople(
      users.filter((u) => u.name === 'Jan'),
      { '1001': { hand: 'right' }, '1002': { hand: 'left' } },
    );
    expect(topIssue(ok).tone).toBe('ok');
  });
});

describe('formatting', () => {
  it('translates firmware reasons to Czech with advice', () => {
    expect(reasonCs('modality_mismatch').tip).toContain('zakryjte obličej');
    expect(reasonCs('enroll: timeout').text).toBe('Snímač nic nezachytil včas');
    expect(reasonCs('weird free text from old firmware').text).toBe('Nepodařilo se');
    expect(reasonCs('face_instead_of_palm').text).toBe('Zachycen obličej místo dlaně');
    expect(reasonCs('face_instead_of_palm').tip).toContain('Zakryjte dlaní obličej');
    for (const code of [
      'timeout',
      'already_enrolled',
      'liveness_failed',
      'camera',
      'full',
      'no_reply',
    ])
      expect(reasonCs(code).text).not.toBe('Nepodařilo se');
  });
  it('labels Wi-Fi quality', () => {
    expect(wifiQuality(-50).label).toBe('Výborný signál');
    expect(wifiQuality(-80).tone).toBe('crit');
    expect(wifiQuality(null).bars).toBe(0);
  });
  it('counts down 30 min of service mode', () => {
    expect(serviceRemaining(new Date(NOW - 60_000).toISOString(), NOW)).toBe(29 * 60);
    expect(serviceRemaining(undefined, NOW)).toBeNull();
  });
  it('says how long ago an entry was enrolled (czPlural)', () => {
    expect(monthsSince('2026-10-05', NOW)).toBe(0);
    expect(enrolledAgoCs('2026-10-04', NOW)).toBe('zapsáno před měsícem');
    expect(enrolledAgoCs('2026-08-01', NOW)).toBe('zapsáno před 3 měsíci');
    expect(enrolledAgoCs('2025-09-20', NOW)).toBe('zapsáno před rokem a měsícem');
    expect(enrolledAgoCs('2023-11-01', NOW)).toBe('zapsáno před 3 roky');
    expect(enrolledAgoCs('2020-11-01', NOW)).toBe('zapsáno před 6 lety');
    expect(enrolledAgoCs(undefined, NOW)).toBe('datum zápisu neznámé');
  });
});

describe('enrolledShortCs', () => {
  it('keeps tile ages to one short line', () => {
    expect(enrolledShortCs(undefined, NOW)).toBe('datum neznámé');
    expect(enrolledShortCs('2026-11-01', NOW)).toBe('tento měsíc');
    expect(enrolledShortCs('2026-03-01', NOW)).toBe('před 8 měs.');
    expect(enrolledShortCs('2023-10-01', NOW)).toBe('před 3 lety');
  });
});
