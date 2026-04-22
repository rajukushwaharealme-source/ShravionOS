import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  ACTIVE_FOCUS_TIMER_STORAGE_KEY,
  REMINDER_NOTIFY_EVENT,
  REMINDER_SETTINGS_EVENT,
  ReminderPayload,
  ReminderSettings,
  normalizeReminderSettings,
  playReminderSound,
  readReminderSettings
} from '../lib/reminders';
import { roundFocusSecondsToMinutes } from '../lib/focus-session-cache';

type ReminderCandidate = {
  id: string;
  dueAt: number;
  title: string;
  body: string;
  tag: string;
  persistentKey: string;
  allowLateForMs?: number;
};

type ReminderToast = ReminderPayload & {
  toastId: string;
};

type ToastTimeoutId = ReturnType<typeof window.setTimeout>;
type StoredFocusTimer = {
  mode?: 'goal' | 'focus' | 'free';
  timerState?: 'idle' | 'running' | 'paused' | 'break';
  goalTimerStyle?: 'timed' | 'free';
  workDuration?: number;
  timeLeft?: number;
  elapsedTime?: number;
  activeStartedAtMs?: number | null;
  elapsedBeforeStartSeconds?: number;
  startTime?: string | null;
  savedAt?: number;
};

const SENT_REMINDERS_KEY = 'shravion.sentReminders.v1';
const CHECK_INTERVAL_MS = 30000;
const FOCUS_TIMER_CHECK_INTERVAL_MS = 1000;
const DEFAULT_LATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOAST_DURATION_MS = 5200;
const MAX_VISIBLE_TOASTS = 3;

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const readSentReminderMap = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem(SENT_REMINDERS_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeSentReminderMap = (sent: Record<string, number>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SENT_REMINDERS_KEY, JSON.stringify(sent));
};

const getFocusCompletionReminderId = (timer: StoredFocusTimer) => {
  const startedAt = timer.startTime ? new Date(timer.startTime).getTime() : Number(timer.activeStartedAtMs || timer.savedAt || 0);
  return `focus-complete:${Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 'active'}`;
};

const readStoredFocusTimer = (): StoredFocusTimer | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawTimer = window.localStorage.getItem(ACTIVE_FOCUS_TIMER_STORAGE_KEY);
    return rawTimer ? JSON.parse(rawTimer) as StoredFocusTimer : null;
  } catch {
    return null;
  }
};

const getStoredFocusElapsedSeconds = (timer: StoredFocusTimer, now = Date.now()) => {
  const baseElapsed = Math.max(0, Number(timer.elapsedBeforeStartSeconds || 0));
  const activeStartedAtMs = Number(timer.activeStartedAtMs || timer.savedAt || now);
  const activeElapsed = timer.timerState === 'running' && Number.isFinite(activeStartedAtMs)
    ? Math.max(0, Math.floor((now - activeStartedAtMs) / 1000))
    : 0;

  return baseElapsed + activeElapsed;
};

const hasReachedTarget = (item: any, parentProgressType?: string) => {
  if (item?.status === 'completed' || item?.completed) return true;

  const target = Number(item?.targetValue || 0);
  if (target <= 0) return false;

  const progressType = item?.progressType || parentProgressType;
  const actual = progressType === 'duration'
    ? Math.max(Number(item?.completedValue) || 0, Number(item?.actualTime) || 0, roundFocusSecondsToMinutes(Number(item?.focusSeconds) || 0))
    : Number(item?.completedValue) || 0;

  return actual >= target;
};

const makeGoalReminderCandidates = (goals: any[], settings: ReminderSettings): ReminderCandidate[] => {
  const now = Date.now();
  const daily = new Date();
  const dailyReminderEnabled = settings.dailyReminderHour !== null;
  const preDeadlineEnabled = settings.preDeadlineMinutes !== null;
  if (dailyReminderEnabled) {
    daily.setHours(settings.dailyReminderHour, 0, 0, 0);
  }
  const dailyDueAt = dailyReminderEnabled && daily.getTime() <= now ? now : daily.getTime();
  const dayKey = todayKey();

  const candidates: ReminderCandidate[] = [];

  goals.forEach((goal) => {
    if (!goal?.id || goal.status === 'completed' || goal.status === 'missed') return;

    const goalTitle = goal.title || 'your goal';
    const goalStart = toDate(goal.startDate);
    const goalDeadline = toDate(goal.deadline);
    const hasGoalSchedule = Boolean(goalStart || goalDeadline);

    if (goalStart) {
      candidates.push({
        id: `goal-start:${goal.id}`,
        dueAt: goalStart.getTime(),
        title: 'Time to start',
        body: `Time to start your goal: ${goalTitle}`,
        tag: `goal-start-${goal.id}`,
        persistentKey: `goal-start:${goal.id}`
      });
    }

    if (goalDeadline) {
      const deadlineAt = goalDeadline.getTime();
      if (preDeadlineEnabled) {
        candidates.push({
          id: `goal-deadline-pre:${goal.id}`,
          dueAt: deadlineAt - settings.preDeadlineMinutes * 60 * 1000,
          title: 'Deadline approaching',
          body: `Your goal deadline is approaching: ${goalTitle}`,
          tag: `goal-deadline-pre-${goal.id}`,
          persistentKey: `goal-deadline-pre:${goal.id}`
        });
      }
      candidates.push({
        id: `goal-deadline:${goal.id}`,
        dueAt: deadlineAt,
        title: 'Goal deadline',
        body: `Your goal deadline is now: ${goalTitle}`,
        tag: `goal-deadline-${goal.id}`,
        persistentKey: `goal-deadline:${goal.id}`
      });
    }

    if (!hasGoalSchedule && dailyReminderEnabled) {
      candidates.push({
        id: `goal-daily:${goal.id}:${dayKey}`,
        dueAt: dailyDueAt,
        title: 'Daily goal reminder',
        body: `Don't forget to work on your goal: ${goalTitle}`,
        tag: `goal-daily-${goal.id}`,
        persistentKey: `goal-daily:${goal.id}:${dayKey}`,
        allowLateForMs: 4 * 60 * 60 * 1000
      });
    }

    if (hasReachedTarget(goal)) {
      candidates.push({
        id: `goal-complete:${goal.id}`,
        dueAt: now,
        title: 'Goal completed',
        body: 'Goal completed. Great work!',
        tag: `goal-complete-${goal.id}`,
        persistentKey: `goal-complete:${goal.id}`,
        allowLateForMs: DEFAULT_LATE_WINDOW_MS
      });
    }

    if (!Array.isArray(goal.subTasks)) return;

    goal.subTasks.forEach((subTask: any) => {
      if (!subTask?.id || subTask.completed) return;

      const subTaskTitle = subTask.title || 'your subtask';
      const subTaskStart = toDate(subTask.startDate);
      const subTaskDeadline = toDate(subTask.deadline);
      const hasSubTaskSchedule = Boolean(subTaskStart || subTaskDeadline);

      if (subTaskStart) {
        candidates.push({
          id: `subtask-start:${goal.id}:${subTask.id}`,
          dueAt: subTaskStart.getTime(),
          title: 'Time to start',
          body: `Time to start your subtask: ${subTaskTitle}`,
          tag: `subtask-start-${subTask.id}`,
          persistentKey: `subtask-start:${goal.id}:${subTask.id}`
        });
      }

      if (subTaskDeadline) {
        const deadlineAt = subTaskDeadline.getTime();
        if (preDeadlineEnabled) {
          candidates.push({
            id: `subtask-deadline-pre:${goal.id}:${subTask.id}`,
            dueAt: deadlineAt - settings.preDeadlineMinutes * 60 * 1000,
            title: 'Deadline approaching',
            body: `Your subtask deadline is approaching: ${subTaskTitle}`,
            tag: `subtask-deadline-pre-${subTask.id}`,
            persistentKey: `subtask-deadline-pre:${goal.id}:${subTask.id}`
          });
        }
        candidates.push({
          id: `subtask-deadline:${goal.id}:${subTask.id}`,
          dueAt: deadlineAt,
          title: 'Subtask deadline',
          body: `Your subtask deadline is now: ${subTaskTitle}`,
          tag: `subtask-deadline-${subTask.id}`,
          persistentKey: `subtask-deadline:${goal.id}:${subTask.id}`
        });
      }

      if (!hasSubTaskSchedule && dailyReminderEnabled) {
        candidates.push({
          id: `subtask-daily:${goal.id}:${subTask.id}:${dayKey}`,
          dueAt: dailyDueAt,
          title: 'Daily subtask reminder',
          body: `Don't forget to work on your subtask: ${subTaskTitle}`,
          tag: `subtask-daily-${subTask.id}`,
          persistentKey: `subtask-daily:${goal.id}:${subTask.id}:${dayKey}`,
          allowLateForMs: 4 * 60 * 60 * 1000
        });
      }
    });
  });

  return candidates.sort((a, b) => a.dueAt - b.dueAt);
};

export const ReminderCenter = () => {
  const { profile, user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [settings, setSettings] = useState<ReminderSettings>(() => user ? readReminderSettings(user.uid) : normalizeReminderSettings(null));
  const [toasts, setToasts] = useState<ReminderToast[]>([]);
  const sentRef = useRef<Record<string, number>>(readSentReminderMap());
  const toastTimerRefs = useRef<Record<string, ToastTimeoutId>>({});
  const settingsRef = useRef<ReminderSettings>(settings);

  const candidates = useMemo(() => makeGoalReminderCandidates(goals, settings), [goals, settings]);

  useEffect(() => {
    if (!user) return;
    const nextSettings = normalizeReminderSettings(profile?.reminderSettings || readReminderSettings(user.uid));
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
  }, [profile?.reminderSettings, user]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!user) return;

    const qGoals = query(collection(db, 'goals'), where('uid', '==', user.uid));
    return onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map((goalDoc) => ({ id: goalDoc.id, ...goalDoc.data() })));
    }, (error) => {
      console.error('Could not load reminder goals', error);
    });
  }, [user]);

  const dismissToast = (toastId: string) => {
    const timeoutId = toastTimerRefs.current[toastId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete toastTimerRefs.current[toastId];
    }
    setToasts((current) => current.filter((toast) => toast.toastId !== toastId));
  };

  const enqueueToast = (payload: ReminderPayload) => {
    const toastId = payload.id || payload.tag || `${payload.title}:${payload.body}`;

    setToasts((current) => {
      const withoutDuplicate = current.filter((toast) => toast.toastId !== toastId);
      return [{ ...payload, toastId }, ...withoutDuplicate].slice(0, MAX_VISIBLE_TOASTS);
    });

    if (toastTimerRefs.current[toastId]) {
      window.clearTimeout(toastTimerRefs.current[toastId]);
    }

    toastTimerRefs.current[toastId] = window.setTimeout(() => dismissToast(toastId), TOAST_DURATION_MS);
  };

  const showReminder = async (payload: ReminderPayload) => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.enabled) return;

    enqueueToast(payload);

    if (currentSettings.vibrationEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([70, 35, 70]);
      } catch (error) {
        console.debug('Reminder vibration was unavailable', error);
      }
    }

    if (currentSettings.soundEnabled) {
      await playReminderSound();
    }

    if ('Notification' in window) {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission === 'granted') {
        new Notification(payload.title, {
          body: payload.body,
          tag: payload.tag,
          silent: true
        });
      }
    }
  };

  const markSent = (key: string) => {
    sentRef.current = { ...sentRef.current, [key]: Date.now() };
    writeSentReminderMap(sentRef.current);
  };

  const checkFocusTimerCompletion = () => {
    if (!settingsRef.current.enabled) return;

    const timer = readStoredFocusTimer();
    if (!timer || timer.timerState !== 'running') return;

    const isStopwatch = timer.mode === 'free' || (timer.mode === 'goal' && timer.goalTimerStyle === 'free');
    if (isStopwatch) return;

    const workDuration = Math.max(1, Number(timer.workDuration || timer.timeLeft || 0));
    const elapsedSeconds = getStoredFocusElapsedSeconds(timer);
    if (elapsedSeconds < workDuration) return;

    const reminderId = getFocusCompletionReminderId(timer);
    if (sentRef.current[reminderId]) return;

    markSent(reminderId);
    showReminder({
      id: reminderId,
      title: 'Focus session complete',
      body: 'Focus session completed. Take a break.',
      tag: 'focus-session-complete'
    });
  };

  const checkDueReminders = () => {
    if (!settingsRef.current.enabled) return;

    const now = Date.now();
    const due = candidates.filter((candidate) => {
      if (sentRef.current[candidate.persistentKey]) return false;
      if (candidate.dueAt > now) return false;
      return now - candidate.dueAt <= (candidate.allowLateForMs ?? DEFAULT_LATE_WINDOW_MS);
    });

    if (due.length === 0) return;

    const toSend = due.slice(0, 3);
    toSend.forEach((candidate) => markSent(candidate.persistentKey));

    if (toSend.length === 1) {
      showReminder(toSend[0]);
      return;
    }

    showReminder({
      title: 'Goal reminders',
      body: `${toSend.length} reminders are ready for your goals.`,
      tag: 'grouped-goal-reminders'
    });
  };

  useEffect(() => {
    checkDueReminders();
    checkFocusTimerCompletion();
    const intervalId = window.setInterval(checkDueReminders, CHECK_INTERVAL_MS);
    const focusTimerIntervalId = window.setInterval(checkFocusTimerCompletion, FOCUS_TIMER_CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkDueReminders);
    window.addEventListener('focus', checkFocusTimerCompletion);
    document.addEventListener('visibilitychange', checkDueReminders);
    document.addEventListener('visibilitychange', checkFocusTimerCompletion);
    window.addEventListener('storage', checkFocusTimerCompletion);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(focusTimerIntervalId);
      window.removeEventListener('focus', checkDueReminders);
      window.removeEventListener('focus', checkFocusTimerCompletion);
      document.removeEventListener('visibilitychange', checkDueReminders);
      document.removeEventListener('visibilitychange', checkFocusTimerCompletion);
      window.removeEventListener('storage', checkFocusTimerCompletion);
    };
  }, [candidates, settings]);

  useEffect(() => {
    return () => {
      Object.keys(toastTimerRefs.current).forEach((toastId) => {
        window.clearTimeout(toastTimerRefs.current[toastId]);
      });
      toastTimerRefs.current = {};
    };
  }, []);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.uid && user?.uid && detail.uid !== user.uid) return;
      const nextSettings = normalizeReminderSettings(detail?.settings);
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
    };

    const handleManualReminder = (event: Event) => {
      const payload = (event as CustomEvent).detail as ReminderPayload | undefined;
      if (!payload) return;
      const key = payload.id || payload.tag || `${payload.title}:${payload.body}`;
      if (sentRef.current[key]) return;
      markSent(key);
      showReminder(payload);
    };

    window.addEventListener(REMINDER_SETTINGS_EVENT, handleSettingsUpdated);
    window.addEventListener(REMINDER_NOTIFY_EVENT, handleManualReminder);

    return () => {
      window.removeEventListener(REMINDER_SETTINGS_EVENT, handleSettingsUpdated);
      window.removeEventListener(REMINDER_NOTIFY_EVENT, handleManualReminder);
    };
  }, [settings, user]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[120] flex flex-col items-center gap-3 px-4 md:inset-x-auto md:right-6 md:bottom-6 md:items-end md:px-0">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.toastId}
            layout
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                {toast.title.toLowerCase().includes('completed') ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1 pr-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{toast.title}</p>
                <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">{toast.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.toastId)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Dismiss reminder"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
