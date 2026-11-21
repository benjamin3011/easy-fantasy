import { after, before, beforeEach, describe, it } from 'node:test';
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { createTestEnv } from './helpers.mjs';

let testEnv;

const LEAGUE_ID = 'league1';

describe('Allowed today, should be blocked', () => {
  before(async () => {
    testEnv = await createTestEnv('known-gaps');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // League with alice as a member (prerequisite for userTips).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues', LEAGUE_ID), { memberUids: ['alice'] });
    });
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  // GAP: When the gap is closed, flip this test to "denied" (assertFails).
  it('owner writes directly to users/{uid}/weeklyLineups/{id}', async () => {
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

  // GAP: When the gap is closed, flip this test to "denied" (assertFails).
  it('owner writes directly to users/{uid}/leagueUsage/{id}/usageCounts/{item}', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice', 'leagueUsage', `${LEAGUE_ID}_2026`, 'usageCounts', 'player_1'), {
        count: 0,
      })
    );
  });

  // GAP: When the gap is closed, flip this test to "denied" (assertFails).
  it('league member writes directly to weeklyTips/{id}/userTips/{uid}', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'weeklyTips', `${LEAGUE_ID}_week_9_season_2026`, 'userTips', 'alice'), {
        userId: 'alice',
        tips: { game1: 'home' },
      })
    );
  });
});
