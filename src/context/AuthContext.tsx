/* eslint-disable react-refresh/only-export-components */
import {
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
    User
  } from 'firebase/auth';
  import { auth, db } from '../firebase/firebase';
  import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
  
  interface AuthContextType {
    user: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (
      email: string,
      password: string,
      firstName: string,
      lastName: string
    ) => Promise<void>;
    signOutUser: () => Promise<void>;
  }
  
  const AuthContext = createContext<AuthContextType | undefined>(undefined);
  
  export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
  
    useEffect(() => {
      const unsub = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      });
      return unsub;
    }, []);
  
    const signIn = (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password).then(() => {});
  
    const signUp = async (
      email: string,
      password: string,
      firstName: string,
      lastName: string
    ) => {
      // 1️⃣ create Auth user
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
  
      // 2️⃣ add displayName
      await updateProfile(user, { displayName: `${firstName} ${lastName}` });
  
      // 3️⃣ Firestore profile doc
      await setDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        email,
        createdAt: serverTimestamp()
      });
    };
  
    const signOutUser = () => signOut(auth);
  
    return (
      <AuthContext.Provider
        value={{ user, loading, signIn, signUp, signOutUser }}
      >
        {children}
      </AuthContext.Provider>
    );
  }
  
  export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
  }
  