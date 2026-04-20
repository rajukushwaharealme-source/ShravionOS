import { collection, deleteDoc, doc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { shouldDeleteFocusSessionFromFirestore } from './focus-session-cache';

const CLEANUP_MARKER_KEY = 'focusApp.lastFirestoreFocusCleanup.v1';
const DELETE_BATCH_SIZE = 25;

const getCleanupKey = (uid: string) => `${CLEANUP_MARKER_KEY}.${uid}`;

const getTodayKey = () => new Date().toISOString().slice(0, 10);

export const cleanupOldFocusSessionsFromFirestore = async (db: Firestore, uid: string) => {
  if (typeof window !== 'undefined') {
    const cleanupKey = getCleanupKey(uid);
    if (window.localStorage.getItem(cleanupKey) === getTodayKey()) return 0;
  }

  const snapshot = await getDocs(query(collection(db, 'pomodoroSessions'), where('uid', '==', uid)));
  const oldFocusSessionIds = snapshot.docs
    .filter(sessionDoc => shouldDeleteFocusSessionFromFirestore(sessionDoc.data()))
    .map(sessionDoc => sessionDoc.id);

  for (let index = 0; index < oldFocusSessionIds.length; index += DELETE_BATCH_SIZE) {
    const ids = oldFocusSessionIds.slice(index, index + DELETE_BATCH_SIZE);
    await Promise.all(ids.map(id => deleteDoc(doc(db, 'pomodoroSessions', id))));
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getCleanupKey(uid), getTodayKey());
  }

  return oldFocusSessionIds.length;
};
