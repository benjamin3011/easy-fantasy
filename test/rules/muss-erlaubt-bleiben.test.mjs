// Schreibzugriffe W1–W12 aus docs/firestore-zugriffe.md (Abschnitt 1), so wie
// die App sie ausführt. Wer die Regeln verschärft, darf diese Tests nicht brechen.
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

// Vorhandene Benachrichtigungen (ungelesen), ohne Regeln angelegt.
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

describe('Muss erlaubt bleiben: Schreibzugriffe des Clients', () => {
  before(async () => {
    testEnv = await createTestEnv('erlaubt');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  it('W1: Registrierung legt users/{uid} per setDoc an', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice'), {
        firstName: 'Alice',
        lastName: 'Muster',
        email: 'alice@example.com',
        notificationPreferences: defaultNotificationPreferences,
        createdAt: serverTimestamp(),
      })
    );
  });

  it('W2: Push aktivieren schreibt fcmToken per setDoc merge', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice'), { fcmToken: 'token-123' }, { merge: true })
    );
  });

  it('W3: Benachrichtigungs-Einstellungen per setDoc merge', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'users', 'alice'),
        { notificationPreferences: { ...defaultNotificationPreferences, scoring: false } },
        { merge: true }
      )
    );
  });

  it('W4: Onboarding abschließen per updateDoc', async () => {
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

  it('W5: „Alle gelesen“ im Header-Dropdown (Abfrage readAt == null, updateDoc je Dokument)', async () => {
    await seedNotifications('alice', ['n1', 'n2']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      (async () => {
        const q = query(collection(db, 'users', 'alice', 'notifications'), where('readAt', '==', null));
        const snap = await getDocs(q);
        if (snap.size !== 2) throw new Error(`2 ungelesene erwartet, ${snap.size} gefunden`);
        const now = Timestamp.now();
        await Promise.all(snap.docs.map((d) => updateDoc(doc(db, d.ref.path), { readAt: now })));
      })()
    );
  });

  it('W6: einzelne Benachrichtigung im Dropdown als gelesen markieren', async () => {
    await seedNotifications('alice', ['n1']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'alice', 'notifications', 'n1'), { readAt: Timestamp.now() })
    );
  });

  it('W7: „Alle gelesen“ auf /notifications (mit Typfilter)', async () => {
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
        if (snap.size !== 2) throw new Error(`2 ungelesene erwartet, ${snap.size} gefunden`);
        const now = Timestamp.now();
        await Promise.all(snap.docs.map((d) => updateDoc(doc(db, d.ref.path), { readAt: now })));
      })()
    );
  });

  it('W8: einzelne Benachrichtigung auf /notifications als gelesen markieren', async () => {
    await seedNotifications('alice', ['n1']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'alice', 'notifications', 'n1'), { readAt: Timestamp.now() })
    );
  });

  it('W9: einzelne Benachrichtigung löschen', async () => {
    await seedNotifications('alice', ['n1']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'users', 'alice', 'notifications', 'n1')));
  });

  it('W10: „Alle löschen“ per writeBatch und batch.delete', async () => {
    await seedNotifications('alice', ['n1', 'n2', 'n3']);
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      (async () => {
        const snap = await getDocs(query(collection(db, 'users', 'alice', 'notifications')));
        if (snap.size !== 3) throw new Error(`3 Benachrichtigungen erwartet, ${snap.size} gefunden`);
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      })()
    );
  });

  describe('W11: Admin-Mock ändert die Spielzeit in nfl_schedules', () => {
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

    it('erlaubt mit Admin-Claim', async () => {
      const db = adminContext(testEnv).firestore();
      await assertSucceeds(updateDoc(doc(db, 'nfl_schedules', scheduleId), { games: updatedGames }));
    });

    it('lehnt ohne Admin-Claim ab', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(updateDoc(doc(db, 'nfl_schedules', scheduleId), { games: updatedGames }));
    });
  });

  describe('W12: Admin-Mock setzt gamestats per setDoc', () => {
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

    it('erlaubt für Spieler mit Admin-Claim', async () => {
      const db = adminContext(testEnv).firestore();
      await assertSucceeds(setDoc(doc(db, 'players/p1/gamestats/20261108_JAX@BAL'), playerStats));
    });

    it('erlaubt für Teams mit Admin-Claim', async () => {
      const db = adminContext(testEnv).firestore();
      await assertSucceeds(setDoc(doc(db, 'teams/t1/gamestats/20261108_JAX@BAL'), teamStats));
    });

    it('lehnt für Spieler ohne Admin-Claim ab', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(setDoc(doc(db, 'players/p1/gamestats/20261108_JAX@BAL'), playerStats));
    });

    it('lehnt für Teams ohne Admin-Claim ab', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertFails(setDoc(doc(db, 'teams/t1/gamestats/20261108_JAX@BAL'), teamStats));
    });
  });
});
