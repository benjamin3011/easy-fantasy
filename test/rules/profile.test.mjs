import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-easy-fantasy';
const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

// FIRESTORE_EMULATOR_HOST hat die Form "host:port" und wird von
// `firebase emulators:exec` gesetzt.
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST fehlt. Tests per `firebase emulators:exec --only firestore,auth --project demo-easy-fantasy "npm run test:rules"` starten.'
  );
}
const separator = emulatorHost.lastIndexOf(':');
const host = emulatorHost.slice(0, separator);
const port = Number(emulatorHost.slice(separator + 1));

let testEnv;

describe('Firestore-Regeln: users/{uid}', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host,
        port,
        rules: readFileSync(rulesPath, 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  it('erlaubt einem angemeldeten Nutzer, sein eigenes Profil zu schreiben', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { firstName: 'Alice' }));
  });

  it('verbietet einem anderen angemeldeten Nutzer, dieses Profil zu schreiben', async () => {
    const db = testEnv.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, 'users/alice'), { firstName: 'Mallory' }));
  });
});
