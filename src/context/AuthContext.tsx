/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, getIdTokenResult } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { setUserContext, clearUserContext, addBreadcrumb } from '../config/sentry';
import { refreshPushRegistrationIfPermitted } from '../services/pushRegistration';

const defaultNotificationPreferences = {
  enabled: true,
  lineupDeadlineAlerts: true,
  lineupDeadlineMinutes: 180,
  tipsReminderAlerts: true,
  tipsReminderMinutes: 180,
  scoringAlerts: true,
  captainSuccessAlerts: true,
  injuryAlerts: false,
  achievementAlerts: false,
  autoLineupAlerts: false,
  autoTipsAlerts: false,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

interface AuthContextType {
  user: User | null;
  currentUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const signIn = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => {
      addBreadcrumb('User signed in', 'auth', 'info');
    });

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => {
    addBreadcrumb('User signup initiated', 'auth', 'info');
    
    // Create Auth user
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);

    // Add displayName
    await updateProfile(newUser, { displayName: `${firstName} ${lastName}` });

    // Create Firestore profile doc
    await setDoc(doc(db, 'users', newUser.uid), {
      firstName,
      lastName,
      email,
      notificationPreferences: defaultNotificationPreferences,
      createdAt: serverTimestamp()
    });

    addBreadcrumb('User signup completed', 'auth', 'info');
  };

  const signOutUser = async () => {
    try {
      addBreadcrumb('User logout initiated', 'auth', 'info');
      await signOut(auth);
      clearUserContext();
      addBreadcrumb('User logout completed', 'auth', 'info');
    } catch (error) {
      addBreadcrumb('User logout failed', 'auth', 'error');
      throw error;
    }
  };

  const logout = signOutUser;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        
        try {
          // Get user claims for admin status
          const idTokenResult = await getIdTokenResult(firebaseUser, true);
          const userIsAdmin = !!idTokenResult.claims.admin;
          setIsAdmin(userIsAdmin);
        } catch (error) {
          console.error("Error fetching user token claims:", error);
          setIsAdmin(false);
        }
        
        // Update Sentry user context
        setUserContext({
          id: firebaseUser.uid,
          email: firebaseUser.email || undefined,
          username: firebaseUser.displayName || undefined,
        });
        addBreadcrumb(`User authenticated: ${firebaseUser.email}`, 'auth', 'info');
        
        // Refresh push endpoint if notification permission is already granted.
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          refreshPushRegistrationIfPermitted(firebaseUser.uid).catch(err => {
            console.warn('Failed to refresh push registration:', err);
          });
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        clearUserContext();
        addBreadcrumb('User session ended', 'auth', 'info');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    user: currentUser,
    currentUser,
    loading,
    isAdmin,
    signIn,
    signUp,
    signOutUser,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
