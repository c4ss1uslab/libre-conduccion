import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMock = false;
    // For this prototype, we'll use anonymous auth for a seamless experience
    signInAnonymously(auth).catch((error) => {
      console.warn("Firebase Auth Error:", error.code, "- Using mock user for preview.");
      isMock = true;
      setUser({ uid: 'mock-dev-user', isAnonymous: true } as User);
      setLoading(false);
    });
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!isMock) {
        setUser(u);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
