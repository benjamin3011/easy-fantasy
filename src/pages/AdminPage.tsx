// src/pages/AdminPage.tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from '../firebase/firebase'; // Ensure this path is correct
import Button from '../components/ui/button/Button';
import PageMeta from '../components/common/PageMeta';
import PageBreadcrumb from '../components/common/PageBreadCrumb';
import Input from '../components/form/input/InputField';
import Label from '../components/form/Label';
import Alert from "../components/ui/alert/Alert";
import ComponentCard from "../components/common/ComponentCard";

// Type Guard for Firebase Functions errors
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}

// Input/output types for callable functions
interface WeekInput { week: number; season?: number; } // For stats and schedule
interface GenericResult { success: boolean; message: string; }
interface AdminRoleInput { uid: string; }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface EmptyInput { /* For functions with no input payload */ }


export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();

  // --- Loading States ---
  const [updateTeamsLoading, setUpdateTeamsLoading] = useState(false);
  const [adminRoleLoading, setAdminRoleLoading] = useState(false);
  const [processStatsLoading, setProcessStatsLoading] = useState(false);
  const [fetchScheduleLoading, setFetchScheduleLoading] = useState(false); // New state for schedule

  // --- Input States ---
  const [targetUid, setTargetUid] = useState(''); // For assigning admin role
  const [processWeek, setProcessWeek] = useState(''); // For stats processing trigger
  const [scheduleWeek, setScheduleWeek] = useState(''); // New state for schedule trigger

  // --- Feedback States ---
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);


  // --- Error Handling Helper ---
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


  // --- Callable Function Handlers ---

  // Handler for updating Teams & Players
  const triggerUpdateTeamsPlayers = async () => {
    setMessage(null); setError(null); setUpdateTeamsLoading(true);
    try {
      const updateFunction = httpsCallable<EmptyInput, GenericResult>(functions, 'manualUpdateTeamsAndPlayers');
      console.log("Calling manualUpdateTeamsAndPlayers...");
      const result = await updateFunction();
      console.log("Function result:", result.data);
      setMessage(result.data.message || "Team/Player update completed.");
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'data update');
      setError(errorMessage);
    } finally { setUpdateTeamsLoading(false); }
  };

  // Handler for assigning Admin Role
  const handleMakeAdmin = async () => {
    if (!targetUid.trim()) { setError("Please enter a User ID."); return; }
    setMessage(null); setError(null); setAdminRoleLoading(true);
    try {
      const addAdminFunction = httpsCallable<AdminRoleInput, GenericResult>(functions, 'addAdminRole');
      console.log(`Calling addAdminRole for UID: ${targetUid}...`);
      const result = await addAdminFunction({ uid: targetUid.trim() });
      console.log("Function result:", result.data);
      setMessage(result.data.message || `Successfully added admin role.`);
      setTargetUid(''); // Clear input on success
    } catch (err: unknown) {
      const errorMessage = handleFirebaseError(err, 'adding admin role');
      setError(errorMessage);
    } finally { setAdminRoleLoading(false); }
  };

  // Handler for fetching & calculating game stats
  const triggerProcessGameStats = async () => {
    setMessage(null); setError(null);
    const weekNum = parseInt(processWeek, 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
        setError("Please enter valid week (1-18) for stats processing."); return;
    }
    setProcessStatsLoading(true);
    try {
        const processStatsFunction = httpsCallable<WeekInput, GenericResult>(functions, 'manualFetchAndProcessGameStatsForWeek');
        console.log(`Calling manualFetchAndProcessGameStatsForWeek week ${weekNum}...`);
        const result = await processStatsFunction({ week: weekNum });
        setMessage(result.data.message || "Stats processing complete.");
        if (!result.data.success) setError(result.data.message);
    } catch (err: unknown) {
        const errorMessage = handleFirebaseError(err, 'processing game stats');
        setError(errorMessage);
    } finally {
        setProcessStatsLoading(false);
    }
  };

  // *** NEW Handler for fetching weekly schedule ***
  const triggerFetchSchedule = async () => {
    setMessage(null); setError(null);
    const weekNum = parseInt(scheduleWeek, 10); // Use scheduleWeek state

    if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) { // Basic validation
      setError("Please enter a valid week number (1-18) to fetch the schedule.");
      return;
    }

    setFetchScheduleLoading(true); // Use new loading state
    try {
      const fetchScheduleFunction = httpsCallable<WeekInput, GenericResult>(functions, 'manualFetchWeeklySchedule');
      console.log(`Calling manualFetchWeeklySchedule for week ${weekNum}...`);
      const result = await fetchScheduleFunction({ week: weekNum }); // Pass week object
      console.log("Function result:", result.data);
      setMessage(result.data.message || "Schedule fetch process completed.");
      if (!result.data.success && result.data.message) {
        setError(result.data.message);
      }
    } catch (err: unknown) {
      console.error("Error calling manualFetchWeeklySchedule:", err);
      const errorMessage = handleFirebaseError(err, 'fetching schedule');
      setError(errorMessage);
    } finally {
      setFetchScheduleLoading(false); // Use new loading state
    }
  };


  // --- Render Logic ---

  // Loading/Auth Checks
  if (authLoading) { return <p className='p-4 text-center'>Loading authentication...</p>; }
  if (!user) { return <p className='p-4 text-center text-red-600'>Please log in to access the Admin Panel.</p>; }
  if (!isAdmin) {
    return (
      <div className="p-4 text-center">
        <h1 className='text-xl font-bold text-red-600'>Access Denied</h1>
        <p className='text-gray-600 dark:text-gray-400'>You do not have permission to view this page.</p>
      </div>
    );
  }

  // Admin Page Content
  return (
    <>
      <div>
      <PageMeta title="Admin Panel | Easy Fantasy" description='Admin control panel for Easy Fantasy application.' />
      <PageBreadcrumb pageTitle="Admin Panel" />
      <div className="space-y-5 sm:space-y-6 mb-4">
        {/* General Feedback Area */}
        {message && (
          <Alert
            variant="success"
            title="Success Message"
            message={message}
            showLink={false}
          />
        )}
        {error && (
          <Alert
            variant="error"
            title="Error Message"
            message={error}
            showLink={false}
          />
        )}
        
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-5 sm:space-y-6">
          <ComponentCard title='Fetch Weekly Schedule'>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                Manually fetch the NFL game schedule for a specific week from the API and store it in Firestore (collection: `nfl_schedules`).
                The scheduled function fetches the *next* week's schedule automatically every Tuesday.
            </p>
            <div className="flex items-end space-x-3">
                 <div className="flex-grow">
                   <Label htmlFor="scheduleWeekInput">NFL Week (1-18):</Label>
                   <Input
                        id="scheduleWeekInput"
                        type="number"
                        value={scheduleWeek}
                        onChange={(e) => setScheduleWeek(e.target.value)}
                        placeholder="Enter week number"
                        min="1"
                        max="18"
                        disabled={fetchScheduleLoading}
                        className="w-full" // Ensure input takes available width
                    />
                </div>
                <Button
                    onClick={triggerFetchSchedule}
                    disabled={fetchScheduleLoading || !scheduleWeek.trim()}
                    className="shrink-0" // Prevent button shrinking
                >
                    {fetchScheduleLoading ? "Fetching Schedule..." : "Fetch Schedule for Week"}
                </Button>
            </div>
          </ComponentCard>
          <ComponentCard title='Fetch & Process Game Stats'>
            <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                Manually fetch raw box scores, store API-calculated player points, calculate custom team unit points, and save results for all games in a specific week.
            </p>
            <div className="flex items-end space-x-3">
                 <div className="flex-grow">
                   <Label htmlFor="processWeekInput">NFL Week (1-18):</Label>
                   <Input
                        id="processWeekInput" type="number"
                        value={processWeek}
                        onChange={(e) => setProcessWeek(e.target.value)}
                        placeholder="Enter week number" min="1" max="18"
                        disabled={processStatsLoading}
                        className="w-full"
                    />
                 </div>
                 <Button
                    onClick={triggerProcessGameStats}
                    disabled={processStatsLoading || !processWeek.trim()}
                    className="shrink-0"
                >
                    {processStatsLoading ? "Processing Stats..." : "Fetch & Calc Stats"}
                </Button>
            </div>
          </ComponentCard>
        </div>
        <div className="space-y-6">
          <ComponentCard title='Sync Teams & Players'>
              <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                  Manually trigger the update process for NFL teams (info, schedule, season stats) and player rosters (info, season stats, injury data) from the external API. Marks inactive players.
              </p>
              <Button onClick={triggerUpdateTeamsPlayers} disabled={updateTeamsLoading}>
                  {updateTeamsLoading ? "Updating Data..." : "Update Teams & Players Now"}
              </Button>
          </ComponentCard>
          <ComponentCard title='Assign Admin Role'>
          <div className="space-y-2">
               <Label htmlFor="targetUidInput">User ID to make Admin:</Label>
               <Input
                    id="targetUidInput"
                    type="text"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    placeholder="Enter User UID"
                    disabled={adminRoleLoading}
                    className="w-full"
                />
            </div>
             <Button onClick={handleMakeAdmin} disabled={adminRoleLoading || !targetUid.trim()} className="mt-3">
                 {adminRoleLoading ? "Assigning..." : "Make Admin"}
             </Button>
          </ComponentCard>
        </div>
      </div>
      </div>
    </>
  );
}
