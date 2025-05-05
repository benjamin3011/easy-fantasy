// src/pages/AdminPage.tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import Button from '../components/ui/button/Button';
import PageMeta from '../components/common/PageMeta';
import PageBreadcrumb from '../components/common/PageBreadCrumb';
import Input from '../components/form/input/InputField';
import Label from '../components/form/Label';

// Keep the type guard (or move to shared utils)
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}

// Define expected input/output types for the callable function
interface FetchStatsInput { week: number; season?: number; } // Allow optional season override later
interface FetchStatsResult { success: boolean; message: string; }

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  // Loading states for different actions
  const [updateTeamsLoading, setUpdateTeamsLoading] = useState(false);
  const [adminRoleLoading, setAdminRoleLoading] = useState(false);
  const [fetchStatsLoading, setFetchStatsLoading] = useState(false); // New loading state
  // Input states
  const [targetUid, setTargetUid] = useState('');
  const [statsWeek, setStatsWeek] = useState(''); // State for stats week input
  // Feedback states
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Existing Functions (triggerUpdateTeamsPlayers, handleMakeAdmin) ---
  const triggerUpdateTeamsPlayers = async () => {
    setUpdateTeamsLoading(true); setMessage(null); setError(null);
    try {
      const updateFunction = httpsCallable<void, { success: boolean; message: string }>(functions, 'manualUpdateTeamsAndPlayers');
      const result = await updateFunction();
      setMessage(result.data.message || "Team/Player update completed.");
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'data update');
      setError(errorMessage);
    } finally { setUpdateTeamsLoading(false); }
  };

  const handleMakeAdmin = async () => {
    if (!targetUid.trim()) { setError("Please enter a User ID."); return; }
    setAdminRoleLoading(true); setMessage(null); setError(null);
    try {
      const addAdminFunction = httpsCallable<{ uid: string }, { message: string }>(functions, 'addAdminRole');
      const result = await addAdminFunction({ uid: targetUid.trim() });
      setMessage(result.data.message || `Successfully added admin role.`);
      setTargetUid('');
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'adding admin role');
      setError(errorMessage);
    } finally { setAdminRoleLoading(false); }
  };

  // --- NEW Function to trigger fetching game stats for a week ---
  const triggerFetchGameStats = async () => {
    setMessage(null); setError(null); // Clear previous messages
    const weekNum = parseInt(statsWeek, 10);

    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) { // Basic validation
      setError("Please enter a valid week number (1-18).");
      return;
    }

    setFetchStatsLoading(true);
    try {
      // Get a reference to the callable function
      const fetchStatsFunction = httpsCallable<FetchStatsInput, FetchStatsResult>(functions, 'manualFetchAndProcessGameStatsForWeek');

      console.log(`Calling manualFetchAndProcessGameStatsForWeek for week ${weekNum}...`);
      // Call the function with the week number
      const result = await fetchStatsFunction({ week: weekNum });
      console.log("Function result:", result.data);
      setMessage(result.data.message || "Game stats fetch process completed.");
      // Set success/error based on result?
      if (!result.data.success && result.data.message) {
        setError(result.data.message); // Show partial failures as error
      }

    } catch (err: unknown) {
      console.error("Error calling manualFetchAndProcessGameStatsForWeek:", err);
      const errorMessage = handleFirebaseError(err, 'fetching game stats');
      setError(errorMessage);
    } finally {
      setFetchStatsLoading(false);
    }
  };

  // --- Helper to format error messages ---
  const handleFirebaseError = (err: unknown, action: string): string => {
      console.error(`Error during ${action}:`, err);
      if (isFunctionsError(err)) {
        switch (err.code) {
          case 'unauthenticated': return "Authentication error. Please log in again.";
          case 'permission-denied': return "Permission Denied: You are not authorized.";
          case 'invalid-argument': return `Invalid input: ${err.message}`;
          case 'not-found': return `Not found: ${err.message}`;
          case 'internal': return `Server error: ${err.message}. Check function logs.`;
          default: return `Error (${err.code}): ${err.message}`;
        }
      } else if (err instanceof Error) {
        return err.message;
      }
      return `An unexpected error occurred during ${action}.`;
  };

  // --- Render Logic ---
  if (authLoading) { return <p className='p-4 text-center'>Loading authentication...</p>; }
  if (!user) { return <p className='p-4 text-center text-red-600'>Please log in.</p>; }
  if (!isAdmin) {
    return ( <div className="p-4 text-center"><h1 className='text-xl font-bold text-red-600'>Access Denied</h1><p className='text-gray-600'>You do not have permission.</p></div> );
  }

  return (
    <>
      <PageMeta title="Admin Panel | Easy Fantasy" description='Admin Panel' />
      <PageBreadcrumb pageTitle="Admin Panel" />

      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Admin Controls</h1>

        {/* Feedback Area */}
        {message && <div className="p-3 rounded bg-green-100 text-green-800 border border-green-200 text-sm">{message}</div>}
        {error && <div className="p-3 rounded bg-red-100 text-red-800 border border-red-200 text-sm">{error}</div>}

        {/* --- SECTION: Fetch Game Stats --- */}
        <div className='p-4 border rounded bg-white dark:bg-gray-800 shadow'>
            <h2 className='text-lg font-semibold mb-3'>Fetch Weekly Game Stats</h2>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                Manually fetch raw box score stats for all games in a specific NFL week.
                This saves the raw data to Firestore subcollections (doesn't calculate fantasy points yet).
                Uses schedule data stored in Firestore to find game IDs.
            </p>
            <div className="flex items-end space-x-3">
                 <div className="flex-grow">
                   <Label htmlFor="statsWeekInput">NFL Week (1-18):</Label>
                   <Input
                        id="statsWeekInput"
                        type="number"
                        value={statsWeek}
                        onChange={(e) => setStatsWeek(e.target.value)}
                        placeholder="Enter week number"
                        min="1"
                        max="18" // Max NFL regular season weeks
                        disabled={fetchStatsLoading}
                    />
                </div>
                <Button
                    onClick={triggerFetchGameStats}
                    disabled={fetchStatsLoading || !statsWeek.trim()}
                    className="shrink-0" // Prevent button from shrinking too much
                >
                    {fetchStatsLoading ? "Fetching Stats..." : "Fetch Stats for Week"}
                </Button>
            </div>
        </div>

        {/* --- SECTION: Sync Teams/Players --- */}
        <div className='p-4 border rounded bg-white dark:bg-gray-800 shadow'>
            <h2 className='text-lg font-semibold mb-3'>Sync Teams & Players</h2>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                Manually trigger the update process for NFL teams and player rosters/season stats/injury data from the external API.
            </p>
            <Button onClick={triggerUpdateTeamsPlayers} disabled={updateTeamsLoading}>
                {updateTeamsLoading ? "Updating Data..." : "Update Teams & Players Now"}
            </Button>
        </div>

        {/* --- SECTION: Assign Admin Role --- */}
        <div className='p-4 border rounded bg-white dark:bg-gray-800 shadow'>
            <h2 className='text-lg font-semibold mb-3'>Assign Admin Role</h2>
            <div className="space-y-2">
               <Label htmlFor="targetUidInput">User ID to make Admin:</Label>
               <Input
                    id="targetUidInput"
                    type="text"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    placeholder="Enter User UID"
                    disabled={adminRoleLoading}
                />
            </div>
            <Button onClick={handleMakeAdmin} disabled={adminRoleLoading || !targetUid.trim()} className="mt-3">
                {adminRoleLoading ? "Assigning..." : "Make Admin"}
            </Button>
         </div>

      </div>
    </>
  );
}
