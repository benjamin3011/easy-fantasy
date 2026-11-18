import "./setup";

import { test, describe } from "node:test";
import * as assert from "node:assert/strict";

import {
  NO_CAPTAIN_MULTIPLIER,
  getCaptainMultiplier,
  isCaptainPointsConsistent,
} from "../src/captain";

describe("getCaptainMultiplier", () => {
  test("Captain aus → 1.0, auch mit gesetztem Faktor", () => {
    assert.equal(NO_CAPTAIN_MULTIPLIER, 1);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: false, captainPointMultiplier: 2 }), 1);
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: 3 }), 1);
    // nur echtes true zählt, wie in lineupProcessing (`=== true`)
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: "true", captainPointMultiplier: 2 }), 1);
    assert.equal(getCaptainMultiplier(undefined), 1);
    assert.equal(getCaptainMultiplier(null), 1);
  });

  test("Captain an, Feld fehlt → 1.0", () => {
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true }), 1);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: undefined }), 1);
  });

  test("Captain an, ungültiger Wert → 1.0", () => {
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: "2" }), 1);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: null }), 1);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: Number.NaN }), 1);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: Infinity }), 1);
  });

  test("Captain an, gültiger Wert → Liga-Wert", () => {
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: 2 }), 2);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: 1.5 }), 1.5);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: 3 }), 3);
    assert.equal(getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: 1 }), 1);
  });
});

describe("Punkteberechnung: gleicher Captain-Faktor wie vor der Umstellung", () => {
  // Bisheriger Inline-Code aus performWeeklyScoreCalculation (lineupProcessing.ts):
  // Der Faktor wurde nur angewendet, wenn enableCaptainFeature === true (isCaptain).
  function previousEffectiveMultiplier(settings: Record<string, unknown> | undefined): number {
    const enableCaptainFeature = settings?.enableCaptainFeature === true;
    const captainPointMultiplier =
      typeof settings?.captainPointMultiplier === "number" ? settings.captainPointMultiplier : 1.0;
    return enableCaptainFeature ? captainPointMultiplier : 1.0;
  }

  // Bisheriger Inline-Code aus updateUserWeeklyLineupScore (lineupProcessing.ts).
  function previousSingleLineupMultiplier(league: { enableCaptainFeature?: boolean; captainPointMultiplier?: number }): number {
    return league.enableCaptainFeature ? (league.captainPointMultiplier ?? 1) : 1;
  }

  const leagues: Array<Record<string, unknown> | undefined> = [
    undefined,
    {},
    { enableCaptainFeature: false },
    { enableCaptainFeature: false, captainPointMultiplier: 2 },
    { enableCaptainFeature: true },
    { enableCaptainFeature: true, captainPointMultiplier: 1 },
    { enableCaptainFeature: true, captainPointMultiplier: 1.5 },
    { enableCaptainFeature: true, captainPointMultiplier: 2 },
    { enableCaptainFeature: true, captainPointMultiplier: 3 },
    { enableCaptainFeature: true, captainPointMultiplier: "2" },
    { enableCaptainFeature: true, captainPointMultiplier: null },
  ];

  test("Wochenberechnung: Helfer ergibt denselben Faktor", () => {
    for (const league of leagues) {
      assert.equal(getCaptainMultiplier(league), previousEffectiveMultiplier(league), JSON.stringify(league));
    }
  });

  test("Einzel-Lineup: Helfer ergibt denselben Faktor für gespeicherte Ligen", () => {
    const typed = [
      {},
      { enableCaptainFeature: false, captainPointMultiplier: 2 },
      { enableCaptainFeature: true },
      { enableCaptainFeature: true, captainPointMultiplier: 1.5 },
      { enableCaptainFeature: true, captainPointMultiplier: 2 },
      { enableCaptainFeature: true, captainPointMultiplier: 3 },
    ];
    for (const league of typed) {
      assert.equal(getCaptainMultiplier(league), previousSingleLineupMultiplier(league), JSON.stringify(league));
    }
  });

  test("Captain-Punkte 10 bei Faktor 2 → 20", () => {
    const multiplier = getCaptainMultiplier({ enableCaptainFeature: true, captainPointMultiplier: 2 });
    assert.equal(10 * multiplier, 20);
  });
});

describe("isCaptainPointsConsistent", () => {
  test("passt zum Liga-Faktor", () => {
    assert.equal(isCaptainPointsConsistent(10, 15, 1.5), true);
    assert.equal(isCaptainPointsConsistent(10, 20, 2), true);
    assert.equal(isCaptainPointsConsistent(10, 30, 3), true);
    assert.equal(isCaptainPointsConsistent(10, 10, 1), true);
  });

  test("Rundung auf zwei Nachkommastellen ist kein Fehlalarm", () => {
    // 7.33 * 1.5 = 10.995, gespeichert gerundet 11.00
    assert.equal(isCaptainPointsConsistent(7.33, 11, 1.5), true);
  });

  test("Faktor 1.5 gespeichert, aber 2 erwartet → inkonsistent (alter Fehlalarm)", () => {
    assert.equal(isCaptainPointsConsistent(10, 15, 2), false);
    assert.equal(isCaptainPointsConsistent(10, 20, 1.5), false);
  });
});
