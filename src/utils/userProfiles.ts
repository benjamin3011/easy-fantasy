// src/utils/userProfiles.ts

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export interface UserProfile {
  uid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Fetch user profiles for multiple UIDs
 * @param uids Array of user IDs to fetch profiles for
 * @returns Map of UID to UserProfile
 */
export async function fetchUserProfiles(uids: string[]): Promise<Map<string, UserProfile>> {
  const profileMap = new Map<string, UserProfile>();
  
  if (uids.length === 0) return profileMap;

  try {
    // Fetch user profiles in parallel
    const fetchPromises = uids.map(async (uid) => {
      try {
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          return {
            uid,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
          } as UserProfile;
        } else {
          // Return a default profile if user doc doesn't exist
          return {
            uid,
            firstName: 'Unknown',
            lastName: '',
            email: '',
          } as UserProfile;
        }
      } catch (error) {
        console.error(`Error fetching profile for user ${uid}:`, error);
        return {
          uid,
          firstName: 'Unknown',
          lastName: '',
          email: '',
        } as UserProfile;
      }
    });

    const profiles = await Promise.all(fetchPromises);
    
    profiles.forEach(profile => {
      profileMap.set(profile.uid, profile);
    });

  } catch (error) {
    console.error('Error fetching user profiles:', error);
  }

  return profileMap;
}

/**
 * Fetch a single user profile
 * @param uid User ID to fetch profile for
 * @returns UserProfile or null if not found
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        uid,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
      } as UserProfile;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching profile for user ${uid}:`, error);
    return null;
  }
}
