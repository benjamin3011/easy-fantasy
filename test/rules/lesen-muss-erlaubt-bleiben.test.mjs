// Lesezugriffe aus docs/firestore-zugriffe.md (Abschnitt 2), so wie die App sie
// ausführt, plus Gegentests, die abgelehnt bleiben müssen.
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { createTestEnv } from './helpers.mjs';

let testEnv;

const LIGA = 'liga1'; // alice und bob
const FREMDE_LIGA = 'liga2'; // nur carol
const SAISON = '2026';
const WOCHE = 9;
const LINEUP_ID = `${LIGA}_${SAISON}_${WOCHE}`;
const FREMDES_LINEUP_ID = `${FREMDE_LIGA}_${SAISON}_${WOCHE}`;
const TIPS_ID = `${LIGA}_week_${WOCHE}_season_${SAISON}`;
const FREMDE_TIPS_ID = `${FREMDE_LIGA}_week_${WOCHE}_season_${SAISON}`;

// Testdaten ohne Regeln anlegen.
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const lineup = (leagueId) => ({
      leagueId,
      season: SAISON,
      week: WOCHE,
      isComplete: true,
      totalActualPoints: 12,
    });

    await setDoc(doc(db, 'leagues', LIGA), {
      name: 'Die wilden 4',
      isPublic: true,
      memberUids: ['alice', 'bob'],
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'leagues', FREMDE_LIGA), {
      name: 'Andere Liga',
      isPublic: false,
      memberUids: ['carol'],
      createdAt: Timestamp.now(),
    });

    for (const [uid, vorname] of [
      ['alice', 'Alice'],
      ['bob', 'Bob'],
      ['carol', 'Carol'],
    ]) {
      await setDoc(doc(db, 'users', uid), { firstName: vorname, lastName: 'Muster' });
    }

    await setDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID), lineup(LIGA));
    await setDoc(doc(db, 'users', 'bob', 'weeklyLineups', LINEUP_ID), lineup(LIGA));
    await setDoc(
      doc(db, 'users', 'carol', 'weeklyLineups', FREMDES_LINEUP_ID),
      lineup(FREMDE_LIGA)
    );

    for (const uid of ['alice', 'bob']) {
      await setDoc(doc(db, 'users', uid, 'notifications', `${uid}-n1`), {
        type: 'scoring',
        title: 'Test',
        readAt: null,
        createdAt: Timestamp.fromMillis(1000),
      });
      await setDoc(doc(db, 'users', uid, 'notifications', `${uid}-n2`), {
        type: 'deadline',
        title: 'Test',
        readAt: Timestamp.fromMillis(3000),
        createdAt: Timestamp.fromMillis(2000),
      });
      await setDoc(
        doc(db, 'users', uid, 'leagueUsage', `${LIGA}_${SAISON}`, 'usageCounts', 'player-1'),
        { count: 2 }
      );
      await setDoc(
        doc(db, 'users', uid, 'leagueUsage', `${LIGA}_${SAISON}`, 'usageCounts', 'team-1'),
        { count: 1 }
      );
    }

    await setDoc(doc(db, 'weeklyTips', TIPS_ID), { leagueId: LIGA, games: [] });
    await setDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'alice'), { tips: {} });
    await setDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'bob'), { tips: {} });
    await setDoc(doc(db, 'weeklyTips', FREMDE_TIPS_ID), { leagueId: FREMDE_LIGA, games: [] });
    await setDoc(doc(db, 'weeklyTips', FREMDE_TIPS_ID, 'userTips', 'carol'), { tips: {} });

    await setDoc(doc(db, 'players', 'p1'), { position: 'QB', name: 'Spieler' });
    await setDoc(doc(db, 'players', 'p1', 'gamestats', 'g1'), { gameId: 'g1', fantasyPoints: 10 });
    await setDoc(doc(db, 'teams', 't1'), { abbreviation: 'BAL', name: 'Ravens' });
    await setDoc(doc(db, 'teams', 't1', 'gamestats', 'g1'), { gameId: 'g1', fantasyPoints: 5 });
    await setDoc(doc(db, 'nfl_schedules', `${SAISON}_week_${WOCHE}`), { games: [] });
    await setDoc(doc(db, 'gameScores', 'g1'), { week: WOCHE, season: SAISON, status: 'final' });
  });
}

describe('Muss erlaubt bleiben: Lesezugriffe des Clients', () => {
  before(async () => {
    testEnv = await createTestEnv('lesen-erlaubt');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  describe('users', () => {
    it('eigenes Profil lesen', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'alice')));
    });

    it('fremdes Profil lesen (Ranglisten)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'bob')));
    });

    it('Profil eines Nutzers aus fremder Liga lesen (userProfiles, beliebige uid)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'carol')));
    });
  });

  describe('users/{uid}/notifications', () => {
    it('eigene Benachrichtigungen: Abfrage ungelesen, neueste zuerst, Limit 20', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(
          query(
            collection(db, 'users', 'alice', 'notifications'),
            where('readAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(20)
          )
        )
      );
      if (snap.size !== 1) throw new Error(`1 ungelesene erwartet, ${snap.size} erhalten`);
    });

    it('eigene Benachrichtigungen: Abfrage mit Typfilter', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'users', 'alice', 'notifications'),
            where('type', '==', 'scoring'),
            orderBy('createdAt', 'desc'),
            limit(20)
          )
        )
      );
    });

    it('eigene Benachrichtigungen: Abfrage ohne Filter („Alle löschen“)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(collection(db, 'users', 'alice', 'notifications'))
      );
      if (snap.size !== 2) throw new Error(`2 erwartet, ${snap.size} erhalten`);
    });
  });

  describe('users/{uid}/weeklyLineups', () => {
    it('eigenes Lineup lesen (Dokument)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID)));
    });

    it('Lineup eines Mitglieds derselben Liga lesen (Dokument)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'bob', 'weeklyLineups', LINEUP_ID)));
    });

    it('eigene Lineups: Abfrage mit leagueId, season, week, orderBy week, limit', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(
          query(
            collection(db, 'users', 'alice', 'weeklyLineups'),
            where('leagueId', '==', LIGA),
            where('season', '==', SAISON),
            orderBy('week'),
            limit(18)
          )
        )
      );
      if (snap.size !== 1) throw new Error(`1 Lineup erwartet, ${snap.size} erhalten`);
    });
  });

  describe('users/{uid}/leagueUsage/…/usageCounts', () => {
    it('eigene Usage-Zähler lesen (ganze Subsammlung)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(
          collection(db, 'users', 'alice', 'leagueUsage', `${LIGA}_${SAISON}`, 'usageCounts')
        )
      );
      if (snap.size !== 2) throw new Error(`2 Zähler erwartet, ${snap.size} erhalten`);
    });
  });

  describe('leagues', () => {
    it('öffentliche Ligen: Abfrage isPublic, createdAt desc', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'leagues'),
            where('isPublic', '==', true),
            orderBy('createdAt', 'desc'),
            limit(10)
          )
        )
      );
    });

    it('meine Ligen: Abfrage memberUids array-contains, createdAt desc', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(
          query(
            collection(db, 'leagues'),
            where('memberUids', 'array-contains', 'alice'),
            orderBy('createdAt', 'desc')
          )
        )
      );
      if (snap.size !== 1) throw new Error(`1 Liga erwartet, ${snap.size} erhalten`);
    });

    it('Liga-Dokument lesen', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'leagues', LIGA)));
    });
  });

  describe('weeklyTips', () => {
    it('weeklyTips-Dokument der eigenen Liga lesen', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'weeklyTips', TIPS_ID)));
    });

    it('eigene userTips lesen (Dokument)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'alice')));
    });

    it('alle userTips der eigenen Liga lesen (ganze Subsammlung)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(collection(db, 'weeklyTips', TIPS_ID, 'userTips'))
      );
      if (snap.size !== 2) throw new Error(`2 Tipps erwartet, ${snap.size} erhalten`);
    });
  });

  describe('Kerndaten für angemeldete Nutzer', () => {
    it('players: Abfrage position == QB und Dokument', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(
        getDocs(query(collection(db, 'players'), where('position', '==', 'QB')))
      );
      await assertSucceeds(getDoc(doc(db, 'players', 'p1')));
    });

    it('teams: alle, Kürzel mit limit 1 und Dokument', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDocs(collection(db, 'teams')));
      await assertSucceeds(
        getDocs(query(collection(db, 'teams'), where('abbreviation', '==', 'BAL'), limit(1)))
      );
      await assertSucceeds(getDoc(doc(db, 'teams', 't1')));
    });

    it('gamestats von Spielern und Teams: Abfrage gameId == X und Dokument', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      for (const pfad of ['players/p1/gamestats', 'teams/t1/gamestats']) {
        await assertSucceeds(
          getDocs(query(collection(db, pfad), where('gameId', '==', 'g1')))
        );
        await assertSucceeds(getDoc(doc(db, `${pfad}/g1`)));
      }
    });

    it('nfl_schedules: Dokument lesen', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'nfl_schedules', `${SAISON}_week_${WOCHE}`)));
    });

    it('gameScores: Dokument und Abfrage week/season', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'gameScores', 'g1')));
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'gameScores'),
            where('week', '==', WOCHE),
            where('season', '==', SAISON)
          )
        )
      );
    });
  });
});

describe('Muss abgelehnt bleiben: Lesezugriffe', () => {
  before(async () => {
    testEnv = await createTestEnv('lesen-abgelehnt');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  describe('nicht angemeldet', () => {
    it('kann kein Profil, keine Benachrichtigungen und keine Usage-Zähler lesen', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice')));
      await assertFails(getDocs(collection(db, 'users', 'alice', 'notifications')));
      await assertFails(
        getDocs(
          collection(db, 'users', 'alice', 'leagueUsage', `${LIGA}_${SAISON}`, 'usageCounts')
        )
      );
    });

    it('kann weder Lineups noch Tipps lesen', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID)));
      await assertFails(getDoc(doc(db, 'weeklyTips', TIPS_ID)));
      await assertFails(getDocs(collection(db, 'weeklyTips', TIPS_ID, 'userTips')));
    });

    it('kann weder Ligen noch Kerndaten lesen', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'leagues', LIGA)));
      await assertFails(
        getDocs(query(collection(db, 'leagues'), where('isPublic', '==', true)))
      );
      await assertFails(getDoc(doc(db, 'players', 'p1')));
      await assertFails(getDocs(collection(db, 'teams')));
      await assertFails(getDoc(doc(db, 'players', 'p1', 'gamestats', 'g1')));
      await assertFails(getDoc(doc(db, 'nfl_schedules', `${SAISON}_week_${WOCHE}`)));
      await assertFails(getDoc(doc(db, 'gameScores', 'g1')));
    });
  });

  describe('angemeldet, aber kein Mitglied der Liga', () => {
    it('kann das Lineup eines Mitglieds dieser Liga nicht lesen', async () => {
      const db = testEnv.authenticatedContext('carol').firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID)));
    });

    it('kann das weeklyTips-Dokument der Liga nicht lesen', async () => {
      const db = testEnv.authenticatedContext('carol').firestore();
      await assertFails(getDoc(doc(db, 'weeklyTips', TIPS_ID)));
    });

    it('kann userTips der Liga nicht lesen (Dokument und Subsammlung)', async () => {
      const db = testEnv.authenticatedContext('carol').firestore();
      await assertFails(getDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'alice')));
      await assertFails(getDocs(collection(db, 'weeklyTips', TIPS_ID, 'userTips')));
    });
  });

  describe('fremde Daten', () => {
    it('fremde Benachrichtigungen: Dokument und Abfrage abgelehnt', async () => {
      const db = testEnv.authenticatedContext('bob').firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice', 'notifications', 'alice-n1')));
      await assertFails(getDocs(collection(db, 'users', 'alice', 'notifications')));
      await assertFails(
        getDocs(
          query(
            collection(db, 'users', 'alice', 'notifications'),
            where('readAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(20)
          )
        )
      );
    });

    it('fremde Usage-Zähler: Subsammlung und Dokument abgelehnt (auch in derselben Liga)', async () => {
      const db = testEnv.authenticatedContext('bob').firestore();
      await assertFails(
        getDocs(
          collection(db, 'users', 'alice', 'leagueUsage', `${LIGA}_${SAISON}`, 'usageCounts')
        )
      );
      await assertFails(
        getDoc(
          doc(db, 'users', 'alice', 'leagueUsage', `${LIGA}_${SAISON}`, 'usageCounts', 'player-1')
        )
      );
    });
  });
});
