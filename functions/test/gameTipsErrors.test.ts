import { firestoreCalls } from "./setup";

import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";

import {
  createWeeklyTips,
  submitTips,
  getProphetLeaderboard,
  calculateTipsResults,
} from "../src/gameTips";

type Auth = CallableRequest["auth"];

const noAuth: Auth = undefined;
const userAuth: Auth = { uid: "user-1", token: { uid: "user-1" } as never };
const adminAuth: Auth = { uid: "admin-1", token: { uid: "admin-1", admin: true } as never };

const makeRequest = (auth: Auth, data: Record<string, unknown> = {}): CallableRequest => ({
  auth,
  data,
  rawRequest: {} as never,
  acceptsStreaming: false,
} as CallableRequest);

const isHttpsError = (code: string, message: string) => (err: unknown): boolean => {
  assert.ok(err instanceof HttpsError, `expected HttpsError, got ${String(err)}`);
  assert.equal(err.code, code);
  assert.equal(err.message, message);
  return true;
};

// Callables in gameTips.ts must reject bad requests with an HttpsError, so the
// client sees the real code instead of "internal". All cases here fail before
// any Firestore access.
describe("gameTips: HttpsError-Codes", () => {
  beforeEach(() => {
    firestoreCalls.length = 0;
  });

  test("submitTips ohne Login → unauthenticated", async () => {
    await assert.rejects(
      submitTips.run(makeRequest(noAuth, { leagueId: "L1", week: 9, tips: {} })),
      isHttpsError("unauthenticated", "Authentication required"),
    );
    assert.deepEqual(firestoreCalls, []);
  });

  test("submitTips ohne tips → invalid-argument", async () => {
    await assert.rejects(
      submitTips.run(makeRequest(userAuth, { leagueId: "L1", week: 9 })),
      isHttpsError("invalid-argument", "League ID, week, and tips are required"),
    );
    assert.deepEqual(firestoreCalls, []);
  });

  test("getProphetLeaderboard ohne leagueId → invalid-argument", async () => {
    await assert.rejects(
      getProphetLeaderboard.run(makeRequest(userAuth, { season: 2026 })),
      isHttpsError("invalid-argument", "League ID is required"),
    );
    assert.deepEqual(firestoreCalls, []);
  });

  test("createWeeklyTips (Admin) ohne week → invalid-argument", async () => {
    await assert.rejects(
      createWeeklyTips.run(makeRequest(adminAuth, { leagueId: "L1" })),
      isHttpsError("invalid-argument", "League ID and week are required"),
    );
    assert.deepEqual(firestoreCalls, []);
  });

  test("calculateTipsResults (Admin) ohne leagueId → invalid-argument", async () => {
    await assert.rejects(
      calculateTipsResults.run(makeRequest(adminAuth, { week: 9 })),
      isHttpsError("invalid-argument", "League ID and week are required"),
    );
    assert.deepEqual(firestoreCalls, []);
  });
});
