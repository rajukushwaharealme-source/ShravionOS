export type CachedFocusSession = {
  id?: string;
  clientSessionId?: string;
  uid?: string;
  durationSeconds?: number;
  durationMinutes?: number;
  sessionType?: string;
  goalId?: string | null;
  subTaskId?: string | null;
  notes?: string;
  startTime?: any;
  endTime?: any;
  completedAt?: any;
  createdAt?: any;
  isTimeBlock?: boolean;
};

const CACHED_FOCUS_SESSIONS_KEY = 'focusApp.cachedFocusSessions.v1';
export const FOCUS_SESSIONS_UPDATED_EVENT = 'focus-sessions-updated';
export const FOCUS_SESSION_RETENTION_DAYS_LABEL = '30 days';

export const createClientSessionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const toSessionDate = (value: any): Date | null => {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getFocusSessionDate = (session: CachedFocusSession) => {
  return toSessionDate(session.completedAt || session.createdAt || session.endTime || session.startTime);
};

export const getFocusSessionSeconds = (session: CachedFocusSession) => {
  return Number(session.durationSeconds) || (Number(session.durationMinutes) || 0) * 60;
};

export const roundFocusSecondsToMinutes = (seconds: number) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return Math.round(safeSeconds / 60);
};

const startOfLocalDay = (date: Date) => {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

export const getFocusRetentionCutoffDate = (now = new Date()) => {
  const cutoff = startOfLocalDay(now);
  const currentDay = cutoff.getDate();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - 1);
  const lastDayOfCutoffMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(currentDay, lastDayOfCutoffMonth));
  return cutoff;
};

export const isFocusSessionInRetentionWindow = (session: CachedFocusSession, now = new Date()) => {
  const sessionDate = getFocusSessionDate(session);
  if (!sessionDate) return true;
  return startOfLocalDay(sessionDate).getTime() > getFocusRetentionCutoffDate(now).getTime();
};

export const pruneFocusSessionsToRetentionWindow = (sessions: CachedFocusSession[], now = new Date()) => {
  return sessions.filter(session => getFocusSessionSeconds(session) > 0 && isFocusSessionInRetentionWindow(session, now));
};

export const shouldDeleteFocusSessionFromFirestore = (session: CachedFocusSession, now = new Date()) => {
  if (session.isTimeBlock) return false;
  const sessionDate = getFocusSessionDate(session);
  if (!sessionDate) return false;
  return startOfLocalDay(sessionDate).getTime() <= getFocusRetentionCutoffDate(now).getTime();
};

export const readCachedFocusSessions = (): CachedFocusSession[] => {
  if (typeof window === 'undefined') return [];

  try {
    const rawSessions = window.localStorage.getItem(CACHED_FOCUS_SESSIONS_KEY);
    if (!rawSessions) return [];
    const sessions = JSON.parse(rawSessions);
    if (!Array.isArray(sessions)) return [];

    const prunedSessions = pruneFocusSessionsToRetentionWindow(sessions);
    if (prunedSessions.length !== sessions.length) {
      window.localStorage.setItem(CACHED_FOCUS_SESSIONS_KEY, JSON.stringify(prunedSessions));
    }

    return prunedSessions;
  } catch (error) {
    console.error('Could not read cached focus sessions', error);
    return [];
  }
};

export const cacheFocusSession = (session: CachedFocusSession) => {
  if (typeof window === 'undefined') return;

  const sessions = readCachedFocusSessions();
  const sessionId = session.clientSessionId || createClientSessionId();
  const nextSession = { ...session, clientSessionId: sessionId };
  const pruned = pruneFocusSessionsToRetentionWindow(sessions);
  const existingIndex = pruned.findIndex(item => item.clientSessionId === sessionId);

  if (existingIndex >= 0) {
    pruned[existingIndex] = nextSession;
  } else {
    pruned.push(nextSession);
  }

  window.localStorage.setItem(CACHED_FOCUS_SESSIONS_KEY, JSON.stringify(pruned));
  window.dispatchEvent(new CustomEvent(FOCUS_SESSIONS_UPDATED_EVENT));
};

export const mergeFocusSessionsWithCache = (remoteSessions: CachedFocusSession[]) => {
  const retainedRemoteSessions = pruneFocusSessionsToRetentionWindow(remoteSessions);
  const remoteClientIds = new Set(
    retainedRemoteSessions
      .map(session => session.clientSessionId)
      .filter(Boolean)
  );
  const cachedSessions = readCachedFocusSessions().filter(session => {
    return session.clientSessionId && !remoteClientIds.has(session.clientSessionId);
  });

  return [...retainedRemoteSessions, ...cachedSessions];
};
