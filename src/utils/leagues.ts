// src/utils/leagues.ts

import {
    collection, doc, getDoc, getDocs, query, where, Timestamp,
    orderBy, limit, startAfter, QueryDocumentSnapshot,
    // *** ADD onSnapshot ***
    onSnapshot
  } from "firebase/firestore";
  // Import client-side SDK instance for reads (now initialized with persistence)
  import { db } from "../firebase/firebase";
  
  // Import Functions SDK parts for WRITE operations
  import { httpsCallable } from "firebase/functions";
  // Import initialized functions instance
  import { functions } from "../firebase/firebase";
  
  // Interfaces remain the same
  export interface Member {
    uid: string;
    teamName: string;
    fantasyPoints?: Record<string, number>;
    fantasyPointsTotal?: number;
  }
  
  export interface League {
    id: string;
    name: string;
    adminUid: string;
    code: string;
    isPublic: boolean;
    members: Member[];
    memberUids: string[];
    createdAt: Timestamp | Date | null; // Keep Timestamp possibility if needed downstream
  }
  
  // --- Callable Function Wrappers (WRITE OPERATIONS - Unchanged) ---
  const createLeagueCallable = httpsCallable<{ name: string; teamName: string; isPublic?: boolean }, { id: string }>(functions, 'createLeague');
  export async function createLeague(name: string, teamName: string, isPublic = false): Promise<{ id: string }> {
      const result = await createLeagueCallable({ name, teamName, isPublic });
      return result.data;
  }
  
  const joinLeagueByCodeCallable = httpsCallable<{ code: string; teamName: string }, { success: boolean; leagueId: string }>(functions, 'joinLeagueByCode');
  export async function joinLeague(code: string, teamName: string): Promise<{ success: boolean; leagueId: string }> {
      const result = await joinLeagueByCodeCallable({ code, teamName });
      return result.data;
  }
  
  const joinLeagueByIdCallable = httpsCallable<{ leagueId: string; teamName: string }, { success: boolean }>(functions, 'joinLeagueById');
  export async function joinLeagueById(leagueId: string, teamName: string): Promise<{ success: boolean }> {
      const result = await joinLeagueByIdCallable({ leagueId, teamName });
      return result.data;
  }
  
  const toggleLeagueVisibilityCallable = httpsCallable<{ leagueId: string; isPublic: boolean }, { success: boolean }>(functions, 'toggleLeagueVisibility');
  export async function toggleLeagueVisibility(leagueId: string, isPublic: boolean): Promise<{ success: boolean }> {
      const result = await toggleLeagueVisibilityCallable({ leagueId, isPublic });
      return result.data;
  }
  
  const renameLeagueCallable = httpsCallable<{ leagueId: string; newName: string }, { success: boolean }>(functions, 'renameLeague');
  export async function renameLeague(leagueId: string, newName: string): Promise<{ success: boolean }> {
      const result = await renameLeagueCallable({ leagueId, newName });
      return result.data;
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
  
    // Query remains the same as getUserLeagues
    const q = query(LEAGUES_COLLECTION,
        where("memberUids", "array-contains", uid),
        orderBy("createdAt", "desc") // Keep consistent ordering
    );
  
    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const leagues = querySnapshot.docs
        .map(mapLeagueData)
        .filter((lg): lg is League => lg !== null); // Map and filter valid data
      callback(leagues); // Pass the updated list to the callback
    }, (error) => { // Firebase automatically passes an Error object here
      // Handle errors during listening
      console.error(`Error listening to user leagues for UID ${uid}:`, error);
      onError(error); // Pass the error to the error handler callback
    });
  
    return unsubscribe; // Return the function to stop listening
  }
  
  