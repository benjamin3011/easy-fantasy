import { firestoreCalls } from "./setup";

import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";

import { requireAdmin } from "../src/common";
import { calculateWeeklyScores } from "../src/lineupProcessing";
import {
  createWeeklyTips,
  repairProphetTotals,
  calculateTipsResults,
  updateTipsOdds,
} from "../src/gameTips";
import { triggerLineupDeadlineCheck } from "../src/notifications";

type Auth = CallableRequest["auth"];

const noAuth: Auth = undefined;
const userAuth: Auth = { uid: "user-1", token: { uid: "user-1" } as never };
const adminAuth: Auth = { uid: "admin-1", token: { uid: "admin-1", admin: true } as never };
const stringClaimAuth: Auth = { uid: "user-2", token: { uid: "user-2", admin: "true" } as never };

const makeRequest = (auth: Auth, data: Record<string, unknown> = {}): CallableRequest => ({
  auth,
  data,
  rawRequest: {} as never,
  acceptsStreaming: false,
} as CallableRequest);

const isHttpsError = (code: string) => (err: unknown): boolean => {
  assert.ok(err instanceof HttpsError, `expected HttpsError, got ${String(err)}`);
  assert.equal(err.code, code);
  return true;
};

test("Test-Setup blockiert Firestore-Zugriffe", () => {
  firestoreCalls.length = 0;
  assert.throws(() => admin.firestore().collection("users"));
  assert.deepEqual(firestoreCalls, ["collection"]);
  firestoreCalls.length = 0;
});

describe("requireAdmin", () => {
  test("ohne Login → unauthenticated", () => {
    assert.throws(() => requireAdmin(makeRequest(noAuth)), isHttpsError("unauthenticated"));
  });

  test("ohne Admin-Claim → permission-denied", () => {
    assert.throws(() => requireAdmin(makeRequest(userAuth)), isHttpsError("permission-denied"));
  });

  test("Claim muss genau true sein (\"true\" reicht nicht)", () => {
    assert.throws(() => requireAdmin(makeRequest(stringClaimAuth)), isHttpsError("permission-denied"));
  });

  test("mit Admin-Claim → gibt Auth zurück", () => {
    const auth = requireAdmin(makeRequest(adminAuth));
    assert.equal(auth.uid, "admin-1");
  });
});

// Data that would pass each function's own input validation, so a rejection
// can only come from the admin check.
const callables = [
  { name: "repairProphetTotals", fn: repairProphetTotals, data: { leagueId: "L1", season: 2026 } },
  { name: "calculateWeeklyScores", fn: calculateWeeklyScores, data: { week: 9, season: 2026 } },
  { name: "createWeeklyTips", fn: createWeeklyTips, data: { leagueId: "L1", week: 9, season: 2026 } },
  { name: "calculateTipsResults", fn: calculateTipsResults, data: { leagueId: "L1", week: 9, season: 2026 } },
  { name: "updateTipsOdds", fn: updateTipsOdds, data: { week: 9, season: 2026 } },
  { name: "triggerLineupDeadlineCheck", fn: triggerLineupDeadlineCheck, data: {} },
];

for (const { name, fn, data } of callables) {
  describe(name, () => {
    beforeEach(() => {
      firestoreCalls.length = 0;
    });

    test("ohne Login abgelehnt, ohne Firestore-Zugriff", async () => {
      await assert.rejects(fn.run(makeRequest(noAuth, data)), isHttpsError("unauthenticated"));
      assert.deepEqual(firestoreCalls, []);
    });

    test("ohne Admin-Claim abgelehnt, ohne Firestore-Zugriff", async () => {
      await assert.rejects(fn.run(makeRequest(userAuth, data)), isHttpsError("permission-denied"));
      assert.deepEqual(firestoreCalls, []);
    });
  });
}

// For admins the check lets the request through: the function's own input
// validation runs next (still before any read).
describe("Admin kommt an der Prüfung vorbei", () => {
  test("calculateWeeklyScores: ungültige Woche → invalid-argument", async () => {
    await assert.rejects(
      calculateWeeklyScores.run(makeRequest(adminAuth, { week: 0 })),
      isHttpsError("invalid-argument"),
    );
  });

  test("repairProphetTotals: fehlende leagueId → invalid-argument", async () => {
    await assert.rejects(
      repairProphetTotals.run(makeRequest(adminAuth, { season: 2026 })),
      isHttpsError("invalid-argument"),
    );
  });
});
