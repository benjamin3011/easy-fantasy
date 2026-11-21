// Read accesses from docs/firestore-zugriffe.md (section 2), as the app
// performs them, plus counter-tests that must stay denied.
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

const LEAGUE = 'league1'; // alice and bob
const OTHER_LEAGUE = 'league2'; // carol only
const SEASON = '2026';
const WEEK = 9;
const LINEUP_ID = `${LEAGUE}_${SEASON}_${WEEK}`;
const OTHER_LINEUP_ID = `${OTHER_LEAGUE}_${SEASON}_${WEEK}`;
const TIPS_ID = `${LEAGUE}_week_${WEEK}_season_${SEASON}`;
const OTHER_TIPS_ID = `${OTHER_LEAGUE}_week_${WEEK}_season_${SEASON}`;

// Create test data with rules disabled.
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const lineup = (leagueId) => ({
      leagueId,
      season: SEASON,
      week: WEEK,
      isComplete: true,
      totalActualPoints: 12,
    });

    await setDoc(doc(db, 'leagues', LEAGUE), {
      name: 'The Wild Four',
      isPublic: true,
      memberUids: ['alice', 'bob'],
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'leagues', OTHER_LEAGUE), {
      name: 'Other League',
      isPublic: false,
      memberUids: ['carol'],
      createdAt: Timestamp.now(),
    });

    for (const [uid, firstName] of [
      ['alice', 'Alice'],
      ['bob', 'Bob'],
      ['carol', 'Carol'],
    ]) {
      await setDoc(doc(db, 'users', uid), { firstName, lastName: 'Example' });
    }

    await setDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID), lineup(LEAGUE));
    await setDoc(doc(db, 'users', 'bob', 'weeklyLineups', LINEUP_ID), lineup(LEAGUE));
    await setDoc(
      doc(db, 'users', 'carol', 'weeklyLineups', OTHER_LINEUP_ID),
      lineup(OTHER_LEAGUE)
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
        doc(db, 'users', uid, 'leagueUsage', `${LEAGUE}_${SEASON}`, 'usageCounts', 'player-1'),
        { count: 2 }
      );
      await setDoc(
        doc(db, 'users', uid, 'leagueUsage', `${LEAGUE}_${SEASON}`, 'usageCounts', 'team-1'),
        { count: 1 }
      );
    }

    await setDoc(doc(db, 'weeklyTips', TIPS_ID), { leagueId: LEAGUE, games: [] });
    await setDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'alice'), { tips: {} });
    await setDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'bob'), { tips: {} });
    await setDoc(doc(db, 'weeklyTips', OTHER_TIPS_ID), { leagueId: OTHER_LEAGUE, games: [] });
    await setDoc(doc(db, 'weeklyTips', OTHER_TIPS_ID, 'userTips', 'carol'), { tips: {} });

    await setDoc(doc(db, 'players', 'p1'), { position: 'QB', name: 'Player' });
    await setDoc(doc(db, 'players', 'p1', 'gamestats', 'g1'), { gameId: 'g1', fantasyPoints: 10 });
    await setDoc(doc(db, 'teams', 't1'), { abbreviation: 'BAL', name: 'Ravens' });
    await setDoc(doc(db, 'teams', 't1', 'gamestats', 'g1'), { gameId: 'g1', fantasyPoints: 5 });
    await setDoc(doc(db, 'nfl_schedules', `${SEASON}_week_${WEEK}`), { games: [] });
    await setDoc(doc(db, 'gameScores', 'g1'), { week: WEEK, season: SEASON, status: 'final' });
  });
}

describe('Must stay allowed: client read accesses', () => {
  before(async () => {
    testEnv = await createTestEnv('reads-allowed');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  describe('users', () => {
    it('read own profile', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'alice')));
    });

    it("read another user's profile (leaderboards)", async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'bob')));
    });

    it("read the profile of a user from another league (userProfiles, arbitrary uid)", async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'carol')));
    });
  });

  describe('users/{uid}/notifications', () => {
    it('own notifications: query unread, newest first, limit 20', async () => {
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
      if (snap.size !== 1) throw new Error(`expected 1 unread, got ${snap.size}`);
    });

    it('own notifications: query with type filter', async () => {
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

    it('own notifications: query without filter ("delete all")', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(collection(db, 'users', 'alice', 'notifications'))
      );
      if (snap.size !== 2) throw new Error(`expected 2, got ${snap.size}`);
    });
  });

  describe('users/{uid}/weeklyLineups', () => {
    it('read own lineup (document)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID)));
    });

    it('read the lineup of a member of the same league (document)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'users', 'bob', 'weeklyLineups', LINEUP_ID)));
    });

    it('own lineups: query with leagueId, season, week, orderBy week, limit', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(
          query(
            collection(db, 'users', 'alice', 'weeklyLineups'),
            where('leagueId', '==', LEAGUE),
            where('season', '==', SEASON),
            orderBy('week'),
            limit(18)
          )
        )
      );
      if (snap.size !== 1) throw new Error(`expected 1 lineup, got ${snap.size}`);
    });
  });

  describe('users/{uid}/leagueUsage/…/usageCounts', () => {
    it('read own usage counts (whole subcollection)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(
          collection(db, 'users', 'alice', 'leagueUsage', `${LEAGUE}_${SEASON}`, 'usageCounts')
        )
      );
      if (snap.size !== 2) throw new Error(`expected 2 counters, got ${snap.size}`);
    });
  });

  describe('leagues', () => {
    it('public leagues: query isPublic, createdAt desc', async () => {
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

    it('my leagues: query memberUids array-contains, createdAt desc', async () => {
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
      if (snap.size !== 1) throw new Error(`expected 1 league, got ${snap.size}`);
    });

    it('read league document', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'leagues', LEAGUE)));
    });
  });

  describe('weeklyTips', () => {
    it("read the weeklyTips document of own league", async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'weeklyTips', TIPS_ID)));
    });

    it('read own userTips (document)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'alice')));
    });

    it('read all userTips of own league (whole subcollection)', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      const snap = await assertSucceeds(
        getDocs(collection(db, 'weeklyTips', TIPS_ID, 'userTips'))
      );
      if (snap.size !== 2) throw new Error(`expected 2 tips, got ${snap.size}`);
    });
  });

  describe('core data for signed-in users', () => {
    it('players: query position == QB and document', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(
        getDocs(query(collection(db, 'players'), where('position', '==', 'QB')))
      );
      await assertSucceeds(getDoc(doc(db, 'players', 'p1')));
    });

    it('teams: all, abbreviation with limit 1, and document', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDocs(collection(db, 'teams')));
      await assertSucceeds(
        getDocs(query(collection(db, 'teams'), where('abbreviation', '==', 'BAL'), limit(1)))
      );
      await assertSucceeds(getDoc(doc(db, 'teams', 't1')));
    });

    it('gamestats of players and teams: query gameId == X and document', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      for (const path of ['players/p1/gamestats', 'teams/t1/gamestats']) {
        await assertSucceeds(
          getDocs(query(collection(db, path), where('gameId', '==', 'g1')))
        );
        await assertSucceeds(getDoc(doc(db, `${path}/g1`)));
      }
    });

    it('nfl_schedules: read document', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'nfl_schedules', `${SEASON}_week_${WEEK}`)));
    });

    it('gameScores: document and query week/season', async () => {
      const db = testEnv.authenticatedContext('alice').firestore();
      await assertSucceeds(getDoc(doc(db, 'gameScores', 'g1')));
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'gameScores'),
            where('week', '==', WEEK),
            where('season', '==', SEASON)
          )
        )
      );
    });
  });
});

describe('Must stay denied: read accesses', () => {
  before(async () => {
    testEnv = await createTestEnv('reads-denied');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  describe('not signed in', () => {
    it('cannot read a profile, notifications or usage counts', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice')));
      await assertFails(getDocs(collection(db, 'users', 'alice', 'notifications')));
      await assertFails(
        getDocs(
          collection(db, 'users', 'alice', 'leagueUsage', `${LEAGUE}_${SEASON}`, 'usageCounts')
        )
      );
    });

    it('cannot read lineups or tips', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID)));
      await assertFails(getDoc(doc(db, 'weeklyTips', TIPS_ID)));
      await assertFails(getDocs(collection(db, 'weeklyTips', TIPS_ID, 'userTips')));
    });

    it('cannot read leagues or core data', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'leagues', LEAGUE)));
      await assertFails(
        getDocs(query(collection(db, 'leagues'), where('isPublic', '==', true)))
      );
      await assertFails(getDoc(doc(db, 'players', 'p1')));
      await assertFails(getDocs(collection(db, 'teams')));
      await assertFails(getDoc(doc(db, 'players', 'p1', 'gamestats', 'g1')));
      await assertFails(getDoc(doc(db, 'nfl_schedules', `${SEASON}_week_${WEEK}`)));
      await assertFails(getDoc(doc(db, 'gameScores', 'g1')));
    });
  });

  describe('signed in, but not a member of the league', () => {
    it("cannot read a league member's lineup", async () => {
      const db = testEnv.authenticatedContext('carol').firestore();
      await assertFails(getDoc(doc(db, 'users', 'alice', 'weeklyLineups', LINEUP_ID)));
    });

    it("cannot read the league's weeklyTips document", async () => {
      const db = testEnv.authenticatedContext('carol').firestore();
      await assertFails(getDoc(doc(db, 'weeklyTips', TIPS_ID)));
    });

    it("cannot read the league's userTips (document and subcollection)", async () => {
      const db = testEnv.authenticatedContext('carol').firestore();
      await assertFails(getDoc(doc(db, 'weeklyTips', TIPS_ID, 'userTips', 'alice')));
      await assertFails(getDocs(collection(db, 'weeklyTips', TIPS_ID, 'userTips')));
    });
  });

  describe("other users' data", () => {
    it("another user's notifications: document and query denied", async () => {
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

    it("another user's usage counts: subcollection and document denied (even in the same league)", async () => {
      const db = testEnv.authenticatedContext('bob').firestore();
      await assertFails(
        getDocs(
          collection(db, 'users', 'alice', 'leagueUsage', `${LEAGUE}_${SEASON}`, 'usageCounts')
        )
      );
      await assertFails(
        getDoc(
          doc(db, 'users', 'alice', 'leagueUsage', `${LEAGUE}_${SEASON}`, 'usageCounts', 'player-1')
        )
      );
    });
  });
});
