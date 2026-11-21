import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { createTestEnv } from './helpers.mjs';

let testEnv;

describe('Firestore rules: users/{uid}', () => {
  before(async () => {
    testEnv = await createTestEnv('profile');
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  it('allows a signed-in user to write their own profile', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { firstName: 'Alice' }));
  });

  it('denies another signed-in user writing this profile', async () => {
    const db = testEnv.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, 'users/alice'), { firstName: 'Mallory' }));
  });
});
