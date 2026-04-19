import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  createdAt: any;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch or create user profile
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        const today = new Date().toISOString().split('T')[0];
        
        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          
          // Update streak logic
          let newStreak = data.currentStreak;
          let newLongest = data.longestStreak;
          let updated = false;
          
          if (data.lastActiveDate !== today) {
            const lastActive = new Date(data.lastActiveDate);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (lastActive.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
              newStreak += 1;
            } else {
              newStreak = 1; // Reset streak
            }
            
            if (newStreak > newLongest) {
              newLongest = newStreak;
            }
            
            updated = true;
          }
          
          const updatedProfile = {
            ...data,
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastActiveDate: today,
          };
          
          if (updated) {
            await setDoc(userRef, {
              currentStreak: newStreak,
              longestStreak: newLongest,
              lastActiveDate: today
            }, { merge: true });
          }
          
          setProfile(updatedProfile);
        } else {
          // Create new user profile
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'User',
            photoURL: currentUser.photoURL || '',
            xp: 0,
            level: 1,
            currentStreak: 1,
            longestStreak: 1,
            lastActiveDate: today,
            createdAt: serverTimestamp(),
            role: 'user'
          };
          
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
