// Test setup: must be imported before any module from ../src.
//
// - Points Firestore at an unreachable local address, so an accidental
//   access can never reach real data.
// - Initializes firebase-admin with a demo project (no credentials, no
//   network until something is actually read or written).
// - Records every Firestore entry point (collection, doc, batch, …) and
//   throws, so tests can assert that nothing was read or written.
import * as admin from "firebase-admin";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:1";
process.env.GCLOUD_PROJECT = "demo-test";

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: "demo-test" });
}

export const firestoreCalls: string[] = [];

const proto = admin.firestore.Firestore.prototype as unknown as Record<string, unknown>;
for (const method of ["collection", "collectionGroup", "doc", "batch", "bulkWriter", "runTransaction", "getAll", "listCollections"]) {
  proto[method] = function blocked(): never {
    firestoreCalls.push(method);
    throw new Error(`Firestore.${method} was called in a test`);
  };
}
