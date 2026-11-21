import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { createTestEnv } from './helpers.mjs';

let testEnv;

describe('Firestore-Regeln: users/{uid}', () => {
  before(async () => {
    testEnv = await createTestEnv('profile');
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
