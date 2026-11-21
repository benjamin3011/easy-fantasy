import { after, before, beforeEach, describe, it } from 'node:test';
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { createTestEnv } from './helpers.mjs';

let testEnv;

const LEAGUE_ID = 'liga1';

describe('Heute erlaubt, soll gesperrt werden', () => {
  before(async () => {
    testEnv = await createTestEnv('luecken');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // Liga mit alice als Mitglied (Voraussetzung für userTips).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues', LEAGUE_ID), { memberUids: ['alice'] });
    });
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  // LÜCKE: Beim Schließen der Lücke wird dieser Test auf "abgelehnt" (assertFails) gedreht.
  it('Besitzer schreibt direkt in users/{uid}/weeklyLineups/{id}', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice', 'weeklyLineups', `${LEAGUE_ID}_2026_9`), {
        leagueId: LEAGUE_ID,
        season: 2026,
        week: 9,
        isComplete: true,
        totalActualPoints: 999,
      })
    );
  });

  // LÜCKE: Beim Schließen der Lücke wird dieser Test auf "abgelehnt" (assertFails) gedreht.
  it('Besitzer schreibt direkt in users/{uid}/leagueUsage/{id}/usageCounts/{item}', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice', 'leagueUsage', `${LEAGUE_ID}_2026`, 'usageCounts', 'player_1'), {
        count: 0,
      })
    );
  });

  // LÜCKE: Beim Schließen der Lücke wird dieser Test auf "abgelehnt" (assertFails) gedreht.
  it('Ligamitglied schreibt direkt in weeklyTips/{id}/userTips/{uid}', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'weeklyTips', `${LEAGUE_ID}_week_9_season_2026`, 'userTips', 'alice'), {
        userId: 'alice',
        tips: { game1: 'home' },
      })
    );
  });
});
