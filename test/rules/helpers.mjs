import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-easy-fantasy';
const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

// FIRESTORE_EMULATOR_HOST hat die Form "host:port" und wird von
// `firebase emulators:exec` gesetzt.
export function readEmulatorAddress() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST fehlt. Tests per `firebase emulators:exec --only firestore,auth --project demo-easy-fantasy "npm run test:rules"` starten.'
    );
  }
  const separator = emulatorHost.lastIndexOf(':');
  return {
    host: emulatorHost.slice(0, separator),
    port: Number(emulatorHost.slice(separator + 1)),
  };
}

// Legt die Testumgebung mit den Regeln aus firestore.rules an.
// `node --test` startet jede Testdatei als eigenen Prozess, parallel gegen
// denselben Emulator. Damit sich die Dateien nicht gegenseitig mit
// clearFirestore() die Daten wegräumen, bekommt jede ein eigenes (demo-)Projekt.
export async function createTestEnv(name) {
  const { host, port } = readEmulatorAddress();
  return initializeTestEnvironment({
    projectId: `${PROJECT_ID}-${name}`,
    firestore: {
      host,
      port,
      rules: readFileSync(rulesPath, 'utf8'),
    },
  });
}

// Kontext mit Admin-Claim (wie nach addAdminRole).
export function adminContext(testEnv, uid = 'admin') {
  return testEnv.authenticatedContext(uid, { admin: true });
}
