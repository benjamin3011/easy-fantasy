import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { createTestEnv } from './helpers.mjs';

let testEnv;

const LEAGUE_ID = 'league1';
const USAGE_PATH = ['leagueUsage', `${LEAGUE_ID}_2026`, 'usageCounts'];

describe('Locked for clients', () => {
  before(async () => {
    testEnv = await createTestEnv('locked-for-clients');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // Existing counter written by the "server" (rules disabled = Admin SDK).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'users', 'alice', ...USAGE_PATH, 'player_existing'),
        { count: 3 }
      );
    });
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  describe('users/{uid}/leagueUsage/{id}/usageCounts/{item}', () => {
    it('owner cannot create a counter', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(
        setDoc(doc(db, 'users', 'alice', ...USAGE_PATH, 'player_1'), { count: 0 })
      );
    });

    it('owner cannot update a counter', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(
        updateDoc(doc(db, 'users', 'alice', ...USAGE_PATH, 'player_existing'), { count: 0 })
      );
    });

    it('owner cannot delete a counter', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(
        deleteDoc(doc(db, 'users', 'alice', ...USAGE_PATH, 'player_existing'))
      );
    });
  });
});
