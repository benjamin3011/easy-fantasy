import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-easy-fantasy';
const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

// FIRESTORE_EMULATOR_HOST has the form "host:port" and is set by
// `firebase emulators:exec`.
export function readEmulatorAddress() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is missing. Run the tests via `firebase emulators:exec --only firestore,auth --project demo-easy-fantasy "npm run test:rules"`.'
    );
  }
  const separator = emulatorHost.lastIndexOf(':');
  return {
    host: emulatorHost.slice(0, separator),
    port: Number(emulatorHost.slice(separator + 1)),
  };
}

// Creates the test environment with the rules from firestore.rules.
// `node --test` starts each test file as its own process, in parallel against
// the same emulator. So that the files do not wipe each other's data with
// clearFirestore(), each one gets its own (demo-) project.
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

// Context with admin claim (as after addAdminRole).
export function adminContext(testEnv, uid = 'admin') {
  return testEnv.authenticatedContext(uid, { admin: true });
}
