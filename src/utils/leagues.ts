// src/utils/leagues.ts

import {
    collection, doc, getDoc, getDocs, query, where, Timestamp,
    orderBy, limit, startAfter, QueryDocumentSnapshot,
    onSnapshot
  } from "firebase/firestore";
import { db } from "../firebase/firebase";

// Import the specific callable function references
import {
  createLeagueCallable,
  joinLeagueByCodeCallable,
  joinLeagueByIdCallable,
  toggleLeagueVisibilityCallable,
  renameLeagueCallable,
  updateLeagueCaptainSettingsCallable,
  updateLeagueWeeklyTipsSettingsCallable,
  updateLeagueAutoSettingsCallable
} from '../firebase/callables';
import { 
  CreateLeaguePayload, 
  UpdateLeagueCaptainSettingsPayload,
  UpdateLeagueWeeklyTipsSettingsPayload,
  UpdateLeagueAutoSettingsPayload,
  GenericResult 
} from '../types/functions';

// Types for payloads and results will be inferred from the imported callables
export interface CreateLeagueResult {
  success: boolean;
  message: string;
  id?: string;
}

// Interfaces for Firestore data structure remain the same
export interface Member {
  uid: string;
  teamName: string;
  weeklyPoints?: { [week: string]: number };
  totalSeasonPoints?: number;
  lastUpdated?: Timestamp | Date | null;
}

export interface League {
  id: string;
  name: string;
  adminUid: string;
  code: string;
  isPublic: boolean;
  members: Member[];
  memberUids: string[];
  createdAt: Timestamp | Date | null;
  enableCaptainFeature?: boolean;
  captainPointMultiplier?: number;
  enableWeeklyTips?: boolean;
  autoLineup?: {
    enabled: boolean;
  };
  autoTips?: {
    enabled: boolean;
  };
}

// --- Callable Function Wrappers (WRITE OPERATIONS) ---
// const createLeagueCallable = httpsCallable<{ name: string; teamName: string; isPublic?: boolean }, { id: string }>(functions, 'createLeague');
export async function createLeague(
  name: string, 
  teamName: string, 
  isPublic = false,
  enableCaptainFeature = false,
  captainPointMultiplier = 1.5,
  enableWeeklyTips = false
): Promise<CreateLeagueResult> {
  // Construct the payload according to CreateLeaguePayload
  const payload: CreateLeaguePayload = {
    name,
    teamName,
    isPublic,
    enableCaptainFeature,
    captainPointMultiplier,
    enableWeeklyTips,
  };
  const result = await createLeagueCallable(payload);
  return result.data as CreateLeagueResult; // Cast to match the expected interface
}

// const joinLeagueByCodeCallable = httpsCallable<{ code: string; teamName: string }, { success: boolean; leagueId: string }>(functions, 'joinLeagueByCode');
export async function joinLeague(code: string, teamName: string): Promise<{ success: boolean; leagueId: string }> {
    const result = await joinLeagueByCodeCallable({ code, teamName });
    return result.data;
}

// const joinLeagueByIdCallable = httpsCallable<{ leagueId: string; teamName: string }, { success: boolean }>(functions, 'joinLeagueById');
export async function joinLeagueById(leagueId: string, teamName: string): Promise<{ success: boolean }> {
    const result = await joinLeagueByIdCallable({ leagueId, teamName });
    return result.data;
}

// const toggleLeagueVisibilityCallable = httpsCallable<{ leagueId: string; isPublic: boolean }, { success: boolean }>(functions, 'toggleLeagueVisibility');
export async function toggleLeagueVisibility(leagueId: string, isPublic: boolean): Promise<{ success: boolean }> {
    const result = await toggleLeagueVisibilityCallable({ leagueId, isPublic });
    return result.data;
}

// const renameLeagueCallable = httpsCallable<{ leagueId: string; newName: string }, { success: boolean }>(functions, 'renameLeague');
export async function renameLeague(leagueId: string, newName: string): Promise<{ success: boolean }> {
    const result = await renameLeagueCallable({ leagueId, newName });
    return result.data;
}

// New service function to update league captain settings
export async function updateLeagueCaptainSettings(
  payload: UpdateLeagueCaptainSettingsPayload
): Promise<GenericResult> {
  const result = await updateLeagueCaptainSettingsCallable(payload);
  return result.data; // Assuming result.data is GenericResult
}

// New service function to update league weekly tips settings
export async function updateLeagueWeeklyTipsSettings(
  payload: UpdateLeagueWeeklyTipsSettingsPayload
): Promise<GenericResult> {
  const result = await updateLeagueWeeklyTipsSettingsCallable(payload);
  return result.data; // Assuming result.data is GenericResult
}

// New service function to update league auto-settings
export async function updateLeagueAutoSettings(
  payload: UpdateLeagueAutoSettingsPayload
): Promise<GenericResult> {
  const result = await updateLeagueAutoSettingsCallable(payload);
  return result.data; // Assuming result.data is GenericResult
}

// --- Direct Firestore Access (READ OPERATIONS) ---

const LEAGUES_COLLECTION = collection(db, "leagues");

// Consistent helper to map data and convert timestamp, including basic validation
function mapLeagueData(docSnap: QueryDocumentSnapshot | import("@firebase/firestore").DocumentSnapshot): League | null {
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
    if (typeof data.name !== 'string' || typeof data.adminUid !== 'string' || typeof data.code !== 'string' || typeof data.isPublic !== 'boolean' || !Array.isArray(data.members) || !Array.isArray(data.memberUids)) {
        console.warn(`Invalid data structure for league ${docSnap.id}`, data); return null;
    }
    return {
        id: docSnap.id, name: data.name, adminUid: data.adminUid, code: data.code,
        isPublic: data.isPublic, members: data.members as Member[],
        memberUids: data.memberUids as string[], createdAt: createdAt,
        enableCaptainFeature: data.enableCaptainFeature,
        captainPointMultiplier: data.captainPointMultiplier,
        enableWeeklyTips: data.enableWeeklyTips,
        autoLineup: data.autoLineup,
        autoTips: data.autoTips
    };
}

/**
 * Discover public leagues with pagination - Direct Read
 * NOTE: Requires a composite index on ('isPublic' == true, 'createdAt' DESC) in Firestore
 */
export async function getPublicLeagues(
    pageSize: number = 10,
    lastVisibleDoc?: QueryDocumentSnapshot | null
): Promise<{ leagues: League[]; nextCursor?: QueryDocumentSnapshot }> {
    // Apply constraints as separate arguments to query()
    let q;
    const baseConstraints = [
        where("isPublic", "==", true),
        orderBy("createdAt", "desc"),
        limit(pageSize)
    ];
    if (lastVisibleDoc) {
        q = query(LEAGUES_COLLECTION, ...baseConstraints, startAfter(lastVisibleDoc));
    } else {
        q = query(LEAGUES_COLLECTION, ...baseConstraints);
    }

    const snap = await getDocs(q);
    const leagues = snap.docs
        .map(mapLeagueData)
        .filter((lg): lg is League => lg !== null);
    const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : undefined;
    return { leagues, nextCursor };
}

/** Get leagues of this user - Direct Read (One-time fetch - kept for potential other uses) */
export async function getUserLeagues(uid: string): Promise<League[]> {
  if (!uid) return [];
  // Requires index on ('memberUids' array-contains, 'createdAt' DESC)
  const q = query(LEAGUES_COLLECTION,
      where("memberUids", "array-contains", uid),
      orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(mapLeagueData).filter((lg): lg is League => lg !== null);
}

/** Get one league - Direct Read */
export async function getLeague(id: string): Promise<League | null> {
  if (!id) return null;
  if (!db) { console.error("Firestore DB instance not available in getLeague."); return null; }
  try {
    const leagueDocRef = doc(db, "leagues", id);
    const snap = await getDoc(leagueDocRef);
    return mapLeagueData(snap);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching league ${id}:`, { error: errorMessage, detail: error });
    return null;
  }
}

/**
 * *** NEW: Listen to user's leagues in real-time ***
 * NOTE: Requires a composite index on ('memberUids' array-contains, 'createdAt' DESC) in Firestore
 */
export function listenToUserLeagues(
    uid: string,
    callback: (leagues: League[]) => void, // Function to call with updated leagues
    onError: (error: Error) => void // Function to call on listener error
): () => void { // Returns an unsubscribe function
  if (!db) {
      console.error("Firestore DB instance not available for listenToUserLeagues.");
      onError(new Error("Firestore not available"));
      return () => {}; // Return no-op unsubscribe
  }
  if (!uid) {
      callback([]); // Call with empty array if no user
      return () => {};
  }

  let isActive = true;
  let retryCount = 0;
  const maxRetries = 3;
  let retryTimeout: number | null = null;

  // Query remains the same as getUserLeagues
  const q = query(LEAGUES_COLLECTION,
      where("memberUids", "array-contains", uid),
      orderBy("createdAt", "desc") // Keep consistent ordering
  );

  const createListener = (): (() => void) => {
    if (!isActive) return () => {};

  // Subscribe to real-time updates
    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        if (!isActive) return;
        
        retryCount = 0; // Reset retry count on success
    const leagues = querySnapshot.docs
      .map(mapLeagueData)
      .filter((lg): lg is League => lg !== null); // Map and filter valid data
    callback(leagues); // Pass the updated list to the callback
      }, 
      (error) => { // Firebase automatically passes an Error object here
        if (!isActive) return;
        
    console.error(`Error listening to user leagues for UID ${uid}:`, error);
        
        // Handle specific error types
        if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
          onError(error); // Don't retry auth errors
          return;
        }
        
        // Retry logic for network/temporary errors
        if (retryCount < maxRetries && (
          error.code === 'unavailable' || 
          error.code === 'deadline-exceeded' ||
          error.message.includes('network') ||
          error.message.includes('INTERNAL ASSERTION FAILED')
        )) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
          
          console.warn(`Retrying user leagues listener (${retryCount}/${maxRetries}) in ${delay}ms`);
          
          retryTimeout = window.setTimeout(() => {
            if (isActive) {
              unsubscribe(); // Clean up current listener
              createListener(); // Create new listener
            }
          }, delay);
        } else {
          onError(error); // Pass the error to the error handler callback after retries exhausted
        }
      }
    );

    return unsubscribe;
  };

  const unsubscribeFn = createListener();

  return () => {
    isActive = false;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
    unsubscribeFn();
  };
}

/**
 * *** NEW: Listen to a single league's details in real-time ***
 */
export function listenToLeagueDetail(
    leagueId: string,
    callback: (league: League | null) => void, // Function to call with the updated league or null
    onError: (error: Error) => void // Function to call on listener error
): () => void { // Returns an unsubscribe function
  if (!db) {
      console.error("Firestore DB instance not available for listenToLeagueDetail.");
      onError(new Error("Firestore not available"));
      return () => {}; // Return no-op unsubscribe
  }
  if (!leagueId) {
      console.warn("listenToLeagueDetail called with no leagueId. Returning null.");
      callback(null); // Call with null if no leagueId
      return () => {};
  }

  let isActive = true;
  let retryCount = 0;
  const maxRetries = 3;
  let retryTimeout: number | null = null;

  const leagueDocRef = doc(db, LEAGUES_COLLECTION.id, leagueId); // Use LEAGUES_COLLECTION.id for robustness

  const createListener = (): (() => void) => {
    if (!isActive) return () => {};

    const unsubscribe = onSnapshot(leagueDocRef, 
      (docSnap) => {
        if (!isActive) return;
        
        retryCount = 0; // Reset retry count on success
    // mapLeagueData already checks docSnap.exists() and returns null if not found
    const league = mapLeagueData(docSnap);
    callback(league); // Pass the mapped league (or null) to the callback
      }, 
      (error) => { // Firebase automatically passes an Error object here
        if (!isActive) return;
        
    console.error(`Error listening to league detail for ID ${leagueId}:`, error);
        
        // Handle specific error types
        if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
          onError(error); // Don't retry auth errors
          return;
        }
        
        // Retry logic for network/temporary errors
        if (retryCount < maxRetries && (
          error.code === 'unavailable' || 
          error.code === 'deadline-exceeded' ||
          error.message.includes('network') ||
          error.message.includes('INTERNAL ASSERTION FAILED')
        )) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
          
          console.warn(`Retrying league detail listener (${retryCount}/${maxRetries}) in ${delay}ms`);
          
          retryTimeout = window.setTimeout(() => {
            if (isActive) {
              unsubscribe(); // Clean up current listener
              createListener(); // Create new listener
            }
          }, delay);
        } else {
          onError(error); // Pass the error to the error handler callback after retries exhausted
        }
      }
    );

    return unsubscribe;
  };

  const unsubscribeFn = createListener();

  return () => {
    isActive = false;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
    unsubscribeFn();
  };
}

  