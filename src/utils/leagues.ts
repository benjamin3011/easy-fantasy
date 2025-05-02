// src/utils/leagues.ts

// Keep direct Firestore imports for READ operations
import {
    collection, doc,
    getDoc, getDocs, query,
    where, Timestamp // Import Timestamp type
  } from "firebase/firestore";
  // Import client-side SDK instance for reads
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
    // Use Firestore Timestamp from import, or Date/null after conversion
    createdAt: Timestamp | Date | null;
  }
  
  // --- Callable Function Wrappers (WRITE OPERATIONS) ---
  
  /** Create a league (private by default) - Calls Cloud Function */
  // Define types for input and expected output data
  const createLeagueCallable = httpsCallable<{ name: string; teamName: string; isPublic?: boolean }, { id: string }>(functions, 'createLeague');
  export async function createLeague(name: string, teamName: string, isPublic = false): Promise<{ id: string }> {
      // Type safety: The SDK call will expect the input type and resolve with the output type
      const result = await createLeagueCallable({ name, teamName, isPublic });
      // result.data is typed as { id: string }
      return result.data;
  }
  
  /** Join by code - Calls Cloud Function */
  const joinLeagueByCodeCallable = httpsCallable<{ code: string; teamName: string }, { success: boolean; leagueId: string }>(functions, 'joinLeagueByCode');
  export async function joinLeague(code: string, teamName: string): Promise<{ success: boolean; leagueId: string }> {
      const result = await joinLeagueByCodeCallable({ code, teamName });
      return result.data;
  }
  
  /** Join a public league by ID - Calls Cloud Function */
  const joinLeagueByIdCallable = httpsCallable<{ leagueId: string; teamName: string }, { success: boolean }>(functions, 'joinLeagueById');
  export async function joinLeagueById(leagueId: string, teamName: string): Promise<{ success: boolean }> {
      const result = await joinLeagueByIdCallable({ leagueId, teamName });
      return result.data;
  }
  
  /** Toggle public/private (admin only) - Calls Cloud Function */
  const toggleLeagueVisibilityCallable = httpsCallable<{ leagueId: string; isPublic: boolean }, { success: boolean }>(functions, 'toggleLeagueVisibility');
  export async function toggleLeagueVisibility(leagueId: string, isPublic: boolean): Promise<{ success: boolean }> {
      const result = await toggleLeagueVisibilityCallable({ leagueId, isPublic });
      return result.data;
  }
  
  /** Rename (admin only) - Calls Cloud Function */
  const renameLeagueCallable = httpsCallable<{ leagueId: string; newName: string }, { success: boolean }>(functions, 'renameLeague');
  export async function renameLeague(leagueId: string, newName: string): Promise<{ success: boolean }> {
      const result = await renameLeagueCallable({ leagueId, newName });
      return result.data;
  }
  
  
  // --- Direct Firestore Access (READ OPERATIONS - Keep using client SDK) ---
  
  const LEAGUES_COLLECTION = collection(db, "leagues");
  
  // Helper to convert Firestore Timestamps in league data
  function mapLeagueData(docSnap: import("@firebase/firestore").QueryDocumentSnapshot | import("@firebase/firestore").DocumentSnapshot): League | null {
      if (!docSnap.exists()) return null;
      const data = docSnap.data();
      // Convert Firestore Timestamp to JS Date object for easier use in UI
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
      return {
          id: docSnap.id,
          name: data.name,
          adminUid: data.adminUid,
          code: data.code,
          isPublic: data.isPublic,
          members: data.members,
          memberUids: data.memberUids,
          createdAt: createdAt,
          // Ensure all fields expected by League interface are mapped
      } as League; // Cast helps if types aren't perfectly inferred, but check fields
  }
  
  
  /** Discover all public leagues - Direct Read */
  export async function getPublicLeagues(): Promise<League[]> {
    const q = query(LEAGUES_COLLECTION, where("isPublic", "==", true));
    const snap = await getDocs(q);
    // Use filter(Boolean) or similar to remove nulls cleanly after mapping
    return snap.docs.map(mapLeagueData).filter((lg): lg is League => lg !== null);
  }
  
  /** Get leagues of this user - Direct Read */
  export async function getUserLeagues(uid: string): Promise<League[]> {
    if (!uid) return []; // Prevent query with empty UID
    const q = query(LEAGUES_COLLECTION, where("memberUids", "array-contains", uid));
    const snap = await getDocs(q);
    return snap.docs.map(mapLeagueData).filter((lg): lg is League => lg !== null);
  }
  
  /** Get one league - Direct Read */
  export async function getLeague(id: string): Promise<League | null> {
    if (!id) return null; // Prevent query with empty ID
    const leagueDocRef = doc(db, "leagues", id); // Correctly reference the document
    const snap = await getDoc(leagueDocRef);
    return mapLeagueData(snap);
  }
  