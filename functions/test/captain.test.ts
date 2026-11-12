import "./setup";

import { test, describe } from "node:test";
import * as assert from "node:assert/strict";

import {
  DEFAULT_CAPTAIN_MULTIPLIER,
  getCaptainMultiplier,
  isCaptainPointsConsistent,
} from "../src/captain";

describe("getCaptainMultiplier", () => {
  test("nimmt den Faktor aus der Liga", () => {
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: 1 }), 1);
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: 2 }), 2);
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: 3 }), 3);
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: 1.5 }), 1.5);
  });

  test("Rückfall 1.5 für alte Ligen ohne Faktor", () => {
    assert.equal(DEFAULT_CAPTAIN_MULTIPLIER, 1.5);
    assert.equal(getCaptainMultiplier({}), 1.5);
    assert.equal(getCaptainMultiplier(undefined), 1.5);
    assert.equal(getCaptainMultiplier(null), 1.5);
  });

  test("Rückfall 1.5 bei ungültigem Wert", () => {
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: "2" }), 1.5);
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: null }), 1.5);
    assert.equal(getCaptainMultiplier({ captainPointMultiplier: Number.NaN }), 1.5);
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
