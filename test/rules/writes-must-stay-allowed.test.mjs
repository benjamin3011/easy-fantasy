// Write accesses W1–W12 from docs/firestore-zugriffe.md (section 1), as the app
// performs them. Anyone tightening the rules must not break these tests.
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { adminContext, createTestEnv } from './helpers.mjs';

let testEnv;

const defaultNotificationPreferences = {
  deadlineReminders: true,
  scoring: true,
  captainSuccess: true,
  injuryAlerts: false,
  achievementAlerts: false,
};

// Existing (unread) notifications, created with rules disabled.
async function seedNotifications(uid, ids) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const id of ids) {
      await setDoc(doc(db, 'users', uid, 'notifications', id), {
        type: 'scoring',
        title: 'Test',
        readAt: null,
        createdAt: Timestamp.now(),
      });
    }
  });
}

describe('Must stay allowed: client write accesses', () => {
  before(async () => {
    testEnv = await createTestEnv('writes-allowed');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  it('W1: sign-up creates users/{uid} via setDoc', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice'), {
        firstName: 'Alice',
        lastName: 'Example',
        email: 'alice@example.com',
        notificationPreferences: defaultNotificationPreferences,
        createdAt: serverTimestamp(),
      })
    );
  });

  it('W2: enabling push writes fcmToken via setDoc merge', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice'), { fcmToken: 'token-123' }, { merge: true })
    );
  });

  it('W3: notification settings via setDoc merge', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'users', 'alice'),
        { notificationPreferences: { ...defaultNotificationPreferences, scoring: false } },
        { merge: true }
      )
    );
  });

  it('W4: completing onboarding via updateDoc', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), { firstName: 'Alice' });
    });
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'alice'), {
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      })
    );
  });

  it('W5: "mark all read" in the header dropdown (query readAt == null, updateDoc per document)', async () => {
    await seedNotifications('alice', ['n1', 'n2']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      (async () => {
        const q = query(collection(db, 'users', 'alice', 'notifications'), where('readAt', '==', null));
        const snap = await getDocs(q);
        if (snap.size !== 2) throw new Error(`expected 2 unread, found ${snap.size}`);
        const now = Timestamp.now();
        await Promise.all(snap.docs.map((d) => updateDoc(doc(db, d.ref.path), { readAt: now })));
      })()
    );
  });

  it('W6: mark a single notification as read in the dropdown', async () => {
    await seedNotifications('alice', ['n1']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'alice', 'notifications', 'n1'), { readAt: Timestamp.now() })
    );
  });

  it('W7: "mark all read" on /notifications (with type filter)', async () => {
    await seedNotifications('alice', ['n1', 'n2']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      (async () => {
        const q = query(
          collection(db, 'users', 'alice', 'notifications'),
          where('readAt', '==', null),
          where('type', '==', 'scoring')
        );
        const snap = await getDocs(q);
        if (snap.size !== 2) throw new Error(`expected 2 unread, found ${snap.size}`);
        const now = Timestamp.now();
        await Promise.all(snap.docs.map((d) => updateDoc(doc(db, d.ref.path), { readAt: now })));
      })()
    );
  });

  it('W8: mark a single notification as read on /notifications', async () => {
    await seedNotifications('alice', ['n1']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'alice', 'notifications', 'n1'), { readAt: Timestamp.now() })
    );
  });

  it('W9: delete a single notification', async () => {
    await seedNotifications('alice', ['n1']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'users', 'alice', 'notifications', 'n1')));
  });

  it('W10: "delete all" via writeBatch and batch.delete', async () => {
    await seedNotifications('alice', ['n1', 'n2', 'n3']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      (async () => {
        const snap = await getDocs(query(collection(db, 'users', 'alice', 'notifications')));
        if (snap.size !== 3) throw new Error(`expected 3 notifications, found ${snap.size}`);
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      })()
    );
  });

  describe('W11: admin mock changes the game time in nfl_schedules', () => {
    const scheduleId = '2026_week_9';
    const games = [
      { gameID: '20261108_JAX@BAL', gameTime_epoch: 1000 },
      { gameID: '20261108_CIN@ATL', gameTime_epoch: 2000 },
    ];

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'nfl_schedules', scheduleId), { games });
      });
    });

    const updatedGames = games.map((g, i) => (i === 0 ? { ...g, gameTime_epoch: 5000 } : g));

    it('allows with admin claim', async () => {
      const db = adminContext(testEnv).firestore();
      await assertSucceeds(updateDoc(doc(db, 'nfl_schedules', scheduleId), { games: updatedGames }));
    });

    it('denies without admin claim', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(updateDoc(doc(db, 'nfl_schedules', scheduleId), { games: updatedGames }));
    });
  });

  describe('W12: admin mock sets gamestats via setDoc', () => {
    const playerStats = {
      gameId: '20261108_JAX@BAL',
      season: 2026,
      week: 9,
      lastUpdated: new Date(),
      fantasyPoints: 12.5,
    };
    const teamStats = {
      gameId: '20261108_JAX@BAL',
      season: 2026,
      week: 9,
      lastUpdated: new Date(),
      fantasyPointsPassing: 10,
      fantasyPointsRushing: 8,
      fantasyPointsDefense: 6,
      fantasyPointsSpecialTeams: 2,
    };

    it('allows for players with admin claim', async () => {
      const db = adminContext(testEnv).firestore();
      await assertSucceeds(setDoc(doc(db, 'players/p1/gamestats/20261108_JAX@BAL'), playerStats));
    });

    it('allows for teams with admin claim', async () => {
      const db = adminContext(testEnv).firestore();
      await assertSucceeds(setDoc(doc(db, 'teams/t1/gamestats/20261108_JAX@BAL'), teamStats));
    });

    it('denies for players without admin claim', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(setDoc(doc(db, 'players/p1/gamestats/20261108_JAX@BAL'), playerStats));
    });

    it('denies for teams without admin claim', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(setDoc(doc(db, 'teams/t1/gamestats/20261108_JAX@BAL'), teamStats));
    });
  });
});
