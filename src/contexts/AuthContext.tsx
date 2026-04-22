import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, updateProfile as updateAuthProfile } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { cleanupOldFocusSessionsFromFirestore } from '../lib/focus-session-retention';
import { ReminderSettings } from '../lib/reminders';

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
  reminderSettings?: ReminderSettings;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  updateUserProfile: (updates: Partial<Pick<UserProfile, 'displayName' | 'photoURL'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  updateUserProfile: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUserProfile = async (updates: Partial<Pick<UserProfile, 'displayName' | 'photoURL'>>) => {
    if (!user || !profile) return;

    const cleanUpdates = {
      ...(updates.displayName !== undefined ? { displayName: updates.displayName.trim() } : {}),
      ...(updates.photoURL !== undefined ? { photoURL: updates.photoURL.trim() } : {})
    };

    await updateAuthProfile(user, cleanUpdates);
    await setDoc(doc(db, 'users', user.uid), {
      ...cleanUpdates,
      updatedAt: serverTimestamp()
    }, { merge: true });

    setProfile(prev => prev ? { ...prev, ...cleanUpdates } : prev);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        cleanupOldFocusSessionsFromFirestore(db, currentUser.uid).catch(error => {
          console.error('Could not clean up old focus sessions', error);
        });

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
    <AuthContext.Provider value={{ user, profile, loading, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
