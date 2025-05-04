// src/pages/AdminPage.tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import Button from '../components/ui/button/Button';
import PageMeta from '../components/common/PageMeta';
import PageBreadcrumb from '../components/common/PageBreadCrumb';
import Input from '../components/form/input/InputField'; // Import Input component
import Label from '../components/form/Label'; // Import Label component

function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [updateLoading, setUpdateLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false); // Separate loading state for admin action
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetUid, setTargetUid] = useState(''); // State for the target user ID input

  // Function to trigger the manual update
  const triggerUpdateTeamsPlayers = async () => {
    setUpdateLoading(true); setMessage(null); setError(null);
    try {
      const updateFunction = httpsCallable<void, { success: boolean; message: string }>(functions, 'manualUpdateTeamsAndPlayers');
      console.log("Calling manualUpdateTeamsAndPlayers...");
      const result = await updateFunction();
      console.log("Function result:", result.data);
      setMessage(result.data.message || "Update process completed successfully.");
    } catch (err: unknown) {
      console.error("Error calling manualUpdateTeamsAndPlayers:", err);
      let errorMessage = "An unexpected error occurred during data update.";
      if (isFunctionsError(err)) { /* ... error handling ... */
        switch (err.code) {
          case 'unauthenticated': errorMessage = "Auth error."; break;
          case 'permission-denied': errorMessage = "Permission Denied."; break;
          case 'internal': errorMessage = `Server error: ${err.message}. Check logs.`; break;
          default: errorMessage = `Error (${err.code}): ${err.message}`; break;
        }
      } else if (err instanceof Error) { errorMessage = err.message; }
      setError(errorMessage);
    } finally { setUpdateLoading(false); }
  };

  // *** NEW Function to handle making a user admin ***
  const handleMakeAdmin = async () => {
      if (!targetUid.trim()) {
          setError("Please enter a User ID.");
          return;
      }
      setAdminLoading(true); setMessage(null); setError(null);
      try {
          const addAdminFunction = httpsCallable<{ uid: string }, { message: string }>(functions, 'addAdminRole');
          console.log(`Calling addAdminRole for UID: ${targetUid}...`);
          const result = await addAdminFunction({ uid: targetUid.trim() });
          console.log("Function result:", result.data);
          setMessage(result.data.message || `Successfully added admin role to ${targetUid}.`);
          setTargetUid(''); // Clear input on success
      } catch (err: unknown) {
          console.error("Error calling addAdminRole:", err);
          let errorMessage = "Failed to add admin role.";
          if (isFunctionsError(err)) { /* ... error handling ... */
            switch (err.code) {
              case 'unauthenticated': errorMessage = "Auth error."; break;
              case 'permission-denied': errorMessage = "Permission Denied: Only admins can assign roles."; break;
              case 'invalid-argument': errorMessage = `Invalid input: ${err.message}`; break;
              case 'internal': errorMessage = `Server error: ${err.message}. Check logs.`; break;
              default: errorMessage = `Error (${err.code}): ${err.message}`; break;
            }
          } else if (err instanceof Error) { errorMessage = err.message; }
          setError(errorMessage);
      } finally {
          setAdminLoading(false);
      }
  };


  if (authLoading) { return <p className='p-4 text-center'>Loading authentication...</p>; }
  if (!user) { return <p className='p-4 text-center text-red-600'>Please log in.</p>; }
  if (!isAdmin) { /* ... Access Denied ... */
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

            {/* Data Sync Section */}
            <div className='p-4 border rounded bg-white dark:bg-gray-800 shadow'>
                <h2 className='text-lg font-semibold mb-3'>Data Synchronization</h2>
                <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                    Manually trigger the update process for NFL teams and player rosters from the external API. This can take several minutes.
                </p>
                <Button onClick={triggerUpdateTeamsPlayers} disabled={updateLoading}>
                    {updateLoading ? "Updating Data..." : "Update Teams & Players Now"}
                </Button>
            </div>

            {/* Add Admin Role Section */}
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
                        disabled={adminLoading}
                    />
                </div>
                <Button onClick={handleMakeAdmin} disabled={adminLoading || !targetUid.trim()} className="mt-3">
                    {adminLoading ? "Assigning..." : "Make Admin"}
                </Button>
             </div>

             {/* Add more sections later */}

        </div>
    </>
  );
}
