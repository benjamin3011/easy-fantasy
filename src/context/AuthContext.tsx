/* eslint-disable react-refresh/only-export-components */
import { // Added React import for React.FC/ReactNode
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
  getIdTokenResult // *** Import getIdTokenResult ***
} from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Define the shape of the context value
interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean; // <<< ADDED isAdmin status
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<void>;
  signOutUser: () => Promise<void>;
}

// Create the context with a default value
// <<< ADDED default isAdmin: false
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component props
interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // *** ADD State for admin status ***
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // *** Make the listener callback async to use await ***
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        setUser(firebaseUser);
        try {
          // *** Force refresh the token to get latest custom claims ***
          // Use the imported getIdTokenResult function if using modular SDK >= v9
          // If using older SDK, it's firebaseUser.getIdTokenResult(true)
          const idTokenResult = await getIdTokenResult(firebaseUser, true); // Pass true to force refresh

          // *** Check for the 'admin' custom claim and update state ***
          const userIsAdmin = !!idTokenResult.claims.admin; // Convert to boolean
          setIsAdmin(userIsAdmin);
          // console.log("User claims loaded, isAdmin:", userIsAdmin); // For debugging
        } catch (error) {
          console.error("Error fetching user token claims:", error);
          setIsAdmin(false); // Assume not admin if fetching claims fails
        }
      } else {
        // User is signed out
        setUser(null);
        setIsAdmin(false); // Reset admin status on sign out
      }
      setLoading(false); // Mark loading as complete AFTER checking claims or signing out
    });
    // Cleanup subscription on unmount
    return () => unsub();
  }, []); // Empty dependency array ensures this runs once on mount

  // Sign-in function (unchanged)
  const signIn = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => {
        // No return value needed here after success
    });

  // Sign-up function (unchanged)
  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => {
    // 1️⃣ create Auth user
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);

    // 2️⃣ add displayName
    await updateProfile(newUser, { displayName: `${firstName} ${lastName}` });

    // 3️⃣ Firestore profile doc
    await setDoc(doc(db, 'users', newUser.uid), {
      firstName,
      lastName,
      email,
      createdAt: serverTimestamp()
      // Consider adding { isAdmin: false } here if you store it in Firestore too,
      // but the custom claim is the source of truth for the context.
    });
    // New users will naturally have isAdmin: false in context after onAuthStateChanged runs.
  };

  // Sign-out function (unchanged)
  const signOutUser = () => signOut(auth);

  // Provide the context value including isAdmin
  // <<< Provide isAdmin state in value
  const contextValue: AuthContextType = {
    user,
    loading,
    isAdmin, // <<< Include isAdmin here
    signIn,
    signUp,
    signOutUser
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {/* Render children only after initial auth check is complete */}
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context (unchanged)
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
