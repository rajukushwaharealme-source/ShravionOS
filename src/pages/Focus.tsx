import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Play, Pause, Square, RotateCcw, Target, Clock, Coffee, ChevronDown, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { cacheFocusSession, createClientSessionId, roundFocusSecondsToMinutes } from '../lib/focus-session-cache';
import { ACTIVE_FOCUS_TIMER_STORAGE_KEY, requestReminderNotification } from '../lib/reminders';

type TimerMode = 'goal' | 'focus' | 'free';
type TimerState = 'idle' | 'running' | 'paused' | 'break';
type ActiveTimerState = Extract<TimerState, 'running' | 'break'>;
type GoalTimerStyle = 'timed' | 'free';
type StoredFocusTimer = {
  mode: TimerMode;
  timerState: TimerState;
  pausedTimerState: ActiveTimerState | null;
  goalTimerStyle: GoalTimerStyle;
  selectedGoalId: string | null;
  selectedSubTaskId: string | null;
  workDuration: number;
  breakDuration: number;
  timeLeft: number;
  elapsedTime: number;
  activeStartedAtMs: number | null;
  elapsedBeforeStartSeconds: number;
  notes: string;
  startTime: string | null;
  savedAt: number;
};

const FOCUS_TIMER_STORAGE_KEY = ACTIVE_FOCUS_TIMER_STORAGE_KEY;
const ALLOWED_GOAL_TYPES = ['daily', 'weekly', 'monthly', 'one-time'];
const ALLOWED_PROGRESS_TYPES = ['checkbox', 'percentage', 'duration'];
const normalizeGoalType = (value?: string) => ALLOWED_GOAL_TYPES.includes(value || '') ? value! : 'one-time';
const normalizeProgressType = (value?: string) => ALLOWED_PROGRESS_TYPES.includes(value || '') ? value! : 'checkbox';

export const Focus = () => {
  const { user } = useAuth();
  const location = useLocation();
  const locationState = location.state as { goalId?: string; subTaskId?: string; mode?: TimerMode; durationMinutes?: number } | null;

  const [mode, setMode] = useState<TimerMode>(locationState?.mode || 'focus');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  
  // Timer Settings
  const [workDuration, setWorkDuration] = useState((locationState?.durationMinutes || 25) * 60);
  const [breakDuration, setBreakDuration] = useState(5 * 60);
  const [timeLeft, setTimeLeft] = useState((locationState?.durationMinutes || 25) * 60);
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [goalTimerStyle, setGoalTimerStyle] = useState<GoalTimerStyle>('timed');
  
  // Tracking
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0); // For free timer
  const [activeStartedAtMs, setActiveStartedAtMs] = useState<number | null>(null);
  const [elapsedBeforeStartSeconds, setElapsedBeforeStartSeconds] = useState(0);
  const [pausedTimerState, setPausedTimerState] = useState<ActiveTimerState | null>(null);
  
  // Data
  const [goals, setGoals] = useState<any[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(locationState?.goalId || null);
  const [selectedSubTaskId, setSelectedSubTaskId] = useState<string | null>(locationState?.subTaskId || null);
  const [notes, setNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'save' | 'changeMode' | 'reset', payload?: any } | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const completingTimerRef = useRef(false);
  const skipFirstPersistRef = useRef(true);
  const selectedGoal = goals.find(g => g.id === selectedGoalId);
  const selectedSubTasks = Array.isArray(selectedGoal?.subTasks) ? selectedGoal.subTasks : [];
  const selectedSubTask = selectedSubTasks.find((st: any) => st.id === selectedSubTaskId);

  const clearStoredTimer = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(FOCUS_TIMER_STORAGE_KEY);
  };

  const getDurationGoalMinutes = (goal: any) => {
    const target = Number(goal?.targetValue || goal?.estimatedTime || 0);
    if (target <= 0) return Math.max(1, Number(locationState?.durationMinutes || 25));
    const actual = Number(goal?.completedValue ?? goal?.actualTime ?? 0);
    return Math.max(1, Math.ceil(target - actual));
  };

  const isStopwatchMode = () => mode === 'free' || (mode === 'goal' && goalTimerStyle === 'free');

  const getCurrentSegmentElapsed = (now = Date.now()) => {
    const activeElapsed = (timerState === 'running' || timerState === 'break') && activeStartedAtMs
      ? Math.max(0, Math.floor((now - activeStartedAtMs) / 1000))
      : 0;

    return Math.max(0, elapsedBeforeStartSeconds + activeElapsed);
  };

  const getActiveTimerState = (): ActiveTimerState =>
    timerState === 'break' || pausedTimerState === 'break' ? 'break' : 'running';

  const getCurrentTimerSnapshot = (now = Date.now()) => {
    const segmentElapsed = getCurrentSegmentElapsed(now);

    if (isStopwatchMode()) {
      return {
        elapsedSeconds: segmentElapsed,
        timeLeftSeconds: timeLeft,
        segmentElapsed
      };
    }

    const segmentDuration = getActiveTimerState() === 'break' ? breakDuration : workDuration;
    return {
      elapsedSeconds: elapsedTime,
      timeLeftSeconds: Math.max(0, segmentDuration - segmentElapsed),
      segmentElapsed
    };
  };

  useEffect(() => {
    if (!user) return;
    const qGoals = query(collection(db, 'goals'), where('uid', '==', user.uid), where('status', 'in', ['pending', 'in-progress']));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    return () => unsubGoals();
  }, [user]);

  useEffect(() => {
    if (!locationState?.goalId && !locationState?.subTaskId) return;

    clearStoredTimer();
    setMode(locationState.mode || 'goal');
    setSelectedGoalId(locationState.goalId || null);
    setSelectedSubTaskId(locationState.subTaskId || null);
    setGoalTimerStyle('timed');
    setTimerState('idle');
    setElapsedTime(0);
    setElapsedBeforeStartSeconds(0);
    setActiveStartedAtMs(null);
    setPausedTimerState(null);
    setStartTime(null);

    if (locationState.durationMinutes) {
      const nextDuration = Math.max(60, Number(locationState.durationMinutes) * 60);
      setWorkDuration(nextDuration);
      setTimeLeft(nextDuration);
    }
  }, [location.key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (locationState?.goalId || locationState?.subTaskId) {
      clearStoredTimer();
      return;
    }

    const rawTimer = window.localStorage.getItem(FOCUS_TIMER_STORAGE_KEY);
    if (!rawTimer) return;

    try {
      const stored = JSON.parse(rawTimer) as StoredFocusTimer;
      if (!stored || stored.timerState === 'idle') {
        clearStoredTimer();
        return;
      }

      const now = Date.now();
      const isStoredStopwatch = stored.mode === 'free' || (stored.mode === 'goal' && stored.goalTimerStyle === 'free');
      const storedPausedTimerState = stored.pausedTimerState === 'break' ? 'break' : stored.pausedTimerState === 'running' ? 'running' : null;
      const activeTimerState = stored.timerState === 'break' || storedPausedTimerState === 'break' ? 'break' : 'running';
      const segmentDuration = activeTimerState === 'break'
        ? Math.max(60, Number(stored.breakDuration || 300))
        : Math.max(60, Number(stored.workDuration || 1500));
      const storedBaseElapsed = Number.isFinite(Number(stored.elapsedBeforeStartSeconds))
        ? Math.max(0, Number(stored.elapsedBeforeStartSeconds))
        : isStoredStopwatch
          ? Math.max(0, Number(stored.elapsedTime || 0))
          : Math.max(0, segmentDuration - Number(stored.timeLeft || segmentDuration));
      const restoredActiveStartedAtMs = (stored.timerState === 'running' || stored.timerState === 'break')
        ? Number(stored.activeStartedAtMs || stored.savedAt || now)
        : null;
      const secondsSinceActiveStart = restoredActiveStartedAtMs
        ? Math.max(0, Math.floor((now - restoredActiveStartedAtMs) / 1000))
        : 0;
      const nextSegmentElapsed = storedBaseElapsed + secondsSinceActiveStart;
      const nextElapsed = isStoredStopwatch ? nextSegmentElapsed : Math.max(0, Number(stored.elapsedTime || 0));
      const nextTimeLeft = isStoredStopwatch
        ? Math.max(1, Number(stored.timeLeft || stored.workDuration || 1500))
        : Math.max(0, segmentDuration - nextSegmentElapsed);
      const restoredTimerState = stored.timerState || 'idle';

      setMode(stored.mode || 'focus');
      setGoalTimerStyle(stored.goalTimerStyle || 'timed');
      setSelectedGoalId(stored.selectedGoalId || null);
      setSelectedSubTaskId(stored.selectedSubTaskId || null);
      setWorkDuration(Math.max(60, Number(stored.workDuration || 1500)));
      setBreakDuration(Math.max(60, Number(stored.breakDuration || 300)));
      setTimeLeft(nextTimeLeft);
      setElapsedTime(nextElapsed);
      setNotes(stored.notes || '');
      setStartTime(stored.startTime ? new Date(stored.startTime) : null);
      setElapsedBeforeStartSeconds(storedBaseElapsed);
      setActiveStartedAtMs(restoredActiveStartedAtMs);
      setPausedTimerState(storedPausedTimerState);
      setTimerState(restoredTimerState);
    } catch (error) {
      console.error('Could not restore focus timer', error);
      clearStoredTimer();
    }
  }, []);

  useEffect(() => {
    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }

    if (typeof window === 'undefined') return;
    if (timerState === 'idle') {
      clearStoredTimer();
      return;
    }

    const timerSnapshot: StoredFocusTimer = {
      mode,
      timerState,
      pausedTimerState,
      goalTimerStyle,
      selectedGoalId,
      selectedSubTaskId,
      workDuration,
      breakDuration,
      timeLeft,
      elapsedTime,
      activeStartedAtMs,
      elapsedBeforeStartSeconds,
      notes,
      startTime: startTime ? startTime.toISOString() : null,
      savedAt: Date.now()
    };

    window.localStorage.setItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify(timerSnapshot));
  }, [mode, timerState, pausedTimerState, goalTimerStyle, selectedGoalId, selectedSubTaskId, workDuration, breakDuration, timeLeft, elapsedTime, activeStartedAtMs, elapsedBeforeStartSeconds, notes, startTime]);

  useEffect(() => {
    if (mode !== 'goal' || goalTimerStyle !== 'timed' || timerState !== 'idle' || !selectedGoal) return;
    if (selectedGoal.progressType !== 'duration') return;

    const remainingMinutes = getDurationGoalMinutes(selectedGoal);
    const nextDuration = remainingMinutes * 60;
    setWorkDuration(prev => prev === nextDuration ? prev : nextDuration);
    setTimeLeft(prev => prev === nextDuration ? prev : nextDuration);
  }, [mode, goalTimerStyle, timerState, selectedGoalId, selectedGoal?.targetValue, selectedGoal?.completedValue, selectedGoal?.actualTime]);

  useEffect(() => {
    if (!selectedGoalId) {
      setSelectedSubTaskId(null);
      return;
    }
    if (selectedSubTaskId && !selectedSubTasks.some((st: any) => st.id === selectedSubTaskId)) {
      setSelectedSubTaskId(null);
    }
  }, [selectedGoalId, selectedSubTaskId, selectedSubTasks]);

  useEffect(() => {
    const syncTimerDisplay = () => {
      if (timerState !== 'running' && timerState !== 'break') return;

      const snapshot = getCurrentTimerSnapshot();
      if (isStopwatchMode()) {
        setElapsedTime(prev => prev === snapshot.elapsedSeconds ? prev : snapshot.elapsedSeconds);
        return;
      }

      setTimeLeft(prev => prev === snapshot.timeLeftSeconds ? prev : snapshot.timeLeftSeconds);
      if (snapshot.timeLeftSeconds <= 0) {
        const segmentDuration = timerState === 'break' ? breakDuration : workDuration;
        handleTimerComplete(timerState, Math.max(0, snapshot.segmentElapsed - segmentDuration));
      }
    };

    if (timerState === 'running' || timerState === 'break') {
      syncTimerDisplay();
      timerRef.current = setInterval(syncTimerDisplay, 500);
      document.addEventListener('visibilitychange', syncTimerDisplay);
      window.addEventListener('focus', syncTimerDisplay);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', syncTimerDisplay);
      window.removeEventListener('focus', syncTimerDisplay);
    };
  }, [timerState, mode, goalTimerStyle, activeStartedAtMs, elapsedBeforeStartSeconds, workDuration, breakDuration, pausedTimerState]);

  const handleTimerComplete = async (completedState: ActiveTimerState = getActiveTimerState(), overflowSeconds = 0) => {
    if (completingTimerRef.current) return;
    completingTimerRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (completedState === 'running') {
      requestReminderNotification({
        id: `focus-complete:${startTime?.getTime() || Date.now()}`,
        title: 'Focus session complete',
        body: 'Focus session completed. Take a break.',
        tag: 'focus-session-complete'
      });
      await saveSession(workDuration);
      if (mode === 'focus') {
        const breakElapsed = Math.max(0, overflowSeconds);
        if (breakElapsed >= breakDuration && !autoRepeat) {
          setTimerState('idle');
          setTimeLeft(workDuration);
          setElapsedTime(0);
          setElapsedBeforeStartSeconds(0);
          setActiveStartedAtMs(null);
          setPausedTimerState(null);
          setStartTime(null);
        } else if (breakElapsed >= breakDuration && autoRepeat) {
          const nextWorkElapsed = breakElapsed - breakDuration;
          setTimerState('running');
          setTimeLeft(Math.max(0, workDuration - nextWorkElapsed));
          setStartTime(new Date(Date.now() - nextWorkElapsed * 1000));
          setElapsedBeforeStartSeconds(nextWorkElapsed);
          setActiveStartedAtMs(Date.now());
          setPausedTimerState(null);
        } else {
          setTimerState('break');
          setTimeLeft(Math.max(0, breakDuration - breakElapsed));
          setElapsedBeforeStartSeconds(breakElapsed);
          setActiveStartedAtMs(Date.now());
          setPausedTimerState(null);
        }
      } else {
        setTimerState('idle');
        setTimeLeft(workDuration);
        setElapsedTime(0);
        setElapsedBeforeStartSeconds(0);
        setActiveStartedAtMs(null);
        setPausedTimerState(null);
        setStartTime(null);
      }
    } else if (completedState === 'break') {
      if (autoRepeat) {
        const nextWorkElapsed = Math.max(0, overflowSeconds);
        setTimerState('running');
        setTimeLeft(Math.max(0, workDuration - nextWorkElapsed));
        setStartTime(new Date(Date.now() - nextWorkElapsed * 1000));
        setElapsedBeforeStartSeconds(nextWorkElapsed);
        setActiveStartedAtMs(Date.now());
        setPausedTimerState(null);
      } else {
        setTimerState('idle');
        setTimeLeft(workDuration);
        setElapsedTime(0);
        setElapsedBeforeStartSeconds(0);
        setActiveStartedAtMs(null);
        setPausedTimerState(null);
        setStartTime(null);
      }
    }
    completingTimerRef.current = false;
  };

  const saveSession = async (durationOverrideSeconds?: number) => {
    if (!user) return;
    
    const isStopwatch = isStopwatchMode();
    const snapshot = getCurrentTimerSnapshot();
    const durationSeconds = durationOverrideSeconds ?? (
      isStopwatch ? snapshot.elapsedSeconds : Math.max(0, workDuration - snapshot.timeLeftSeconds)
    );
    const durationMinutes = roundFocusSecondsToMinutes(durationSeconds);
    if (durationSeconds <= 0) return;

    const clientSessionId = createClientSessionId();
    const finishedAt = new Date();
    const startedAt = startTime || new Date(finishedAt.getTime() - durationSeconds * 1000);
    const sessionPayload: any = {
      uid: user.uid,
      clientSessionId,
      durationMinutes,
      completedAt: finishedAt,
      createdAt: finishedAt,
      durationSeconds,
      sessionType: mode,
      notes: notes.trim(),
      startTime: startedAt,
      endTime: finishedAt
    };
    if (selectedGoalId) sessionPayload.goalId = selectedGoalId;
    if (selectedSubTaskId) sessionPayload.subTaskId = selectedSubTaskId;

    cacheFocusSession({
      ...sessionPayload,
      completedAt: finishedAt.toISOString(),
      createdAt: finishedAt.toISOString(),
      startTime: startedAt.toISOString(),
      endTime: finishedAt.toISOString()
    });

    if (selectedGoalId && mode === 'goal') {
      const goal = goals.find(g => g.id === selectedGoalId);
      if (goal) {
        const safeProgressType = normalizeProgressType(goal.progressType);
        const currentActual = safeProgressType === 'duration'
          ? Math.max(Number(goal.actualTime) || 0, Number(goal.completedValue) || 0)
          : Number(goal.actualTime) || 0;
        const newActual = currentActual + durationMinutes;
        const updatedSubTasks = Array.isArray(goal.subTasks) ? goal.subTasks.map((st: any) => {
          if (st.id !== selectedSubTaskId) return st;
          return {
            ...st,
            actualTime: (Number(st.actualTime) || 0) + durationMinutes,
            focusSeconds: (Number(st.focusSeconds) || 0) + durationSeconds
          };
        }) : [];

        let updatedStatus = 'in-progress';
        const updateData: any = {
          actualTime: newActual,
          type: normalizeGoalType(goal.type),
          progressType: safeProgressType
        };

        if (selectedSubTaskId && updatedSubTasks.length > 0) {
          updateData.subTasks = updatedSubTasks;
        }

        // Handle automatic goal completion based on progressType duration
        if (safeProgressType === 'duration' && goal.targetValue) {
          updateData.completedValue = newActual;
          if (newActual >= Number(goal.targetValue)) {
            updatedStatus = 'completed';
            updateData.completedAt = serverTimestamp();
          }
        }

        updateData.status = updatedStatus;

        try {
          await updateDoc(doc(db, 'goals', selectedGoalId), updateData);
        } catch (error) {
          console.error('Could not update focused goal time', error);
        }
      }
    }

    try {
      await addDoc(collection(db, 'pomodoroSessions'), sessionPayload);
    } catch (error) {
      console.error('Could not save focus session', error);
    }
  };

  const toggleTimer = () => {
    const now = Date.now();

    if (timerState === 'idle') {
      setTimerState('running');
      setPausedTimerState(null);
      setElapsedBeforeStartSeconds(0);
      setActiveStartedAtMs(now);
      setStartTime(new Date(now));
      if (isStopwatchMode()) setElapsedTime(0);
    } else if (timerState === 'running' || timerState === 'break') {
      const snapshot = getCurrentTimerSnapshot(now);
      setElapsedBeforeStartSeconds(snapshot.segmentElapsed);
      setActiveStartedAtMs(null);
      setPausedTimerState(timerState);
      if (isStopwatchMode()) {
        setElapsedTime(snapshot.elapsedSeconds);
      } else {
        setTimeLeft(snapshot.timeLeftSeconds);
      }
      setTimerState('paused');
    } else if (timerState === 'paused') {
      setActiveStartedAtMs(now);
      setTimerState(pausedTimerState || 'running');
      setPausedTimerState(null);
    }
  };

  const handleStopTimerClick = () => {
    const isStopwatch = isStopwatchMode();
    const snapshot = getCurrentTimerSnapshot();
    const activeState = getActiveTimerState();
    const workedSeconds = isStopwatch ? snapshot.elapsedSeconds : Math.max(0, workDuration - snapshot.timeLeftSeconds);
    executeStopTimer(activeState !== 'break' && (timerState === 'running' || timerState === 'paused') && workedSeconds > 0);
  };

  const executeStopTimer = async (save: boolean) => {
    if (save) {
      await saveSession();
    }
    setTimerState('idle');
    setTimeLeft(workDuration);
    setElapsedTime(0);
    setElapsedBeforeStartSeconds(0);
    setActiveStartedAtMs(null);
    setPausedTimerState(null);
    setStartTime(null);
    setConfirmAction(null);
    clearStoredTimer();
  };

  const handleChangeMode = (m: TimerMode) => {
    if (timerState !== 'idle') {
      setConfirmAction({ type: 'changeMode', payload: m });
    } else {
      setMode(m);
    }
  };

  const executeChangeMode = () => {
    if (confirmAction?.type === 'changeMode') {
      executeStopTimer(false);
      setMode(confirmAction.payload);
      setConfirmAction(null);
    }
  };

  const handleResetTimer = () => {
    setConfirmAction({ type: 'reset' });
  };

  const executeResetTimer = () => {
    setTimerState('idle');
    setTimeLeft(workDuration);
    setElapsedTime(0);
    setElapsedBeforeStartSeconds(0);
    setActiveStartedAtMs(null);
    setPausedTimerState(null);
    setStartTime(null);
    setConfirmAction(null);
    clearStoredTimer();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const normalizeMinutes = (value: string, fallback: number) => {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 999);
  };

  const setFocusMinutes = (value: string) => {
    const minutes = normalizeMinutes(value, workDuration / 60);
    setWorkDuration(minutes * 60);
    setTimeLeft(minutes * 60);
  };

  const setBreakMinutes = (value: string) => {
    const minutes = normalizeMinutes(value, breakDuration / 60);
    setBreakDuration(minutes * 60);
  };

  const renderDurationControl = (
    label: string,
    valueSeconds: number,
    presets: number[],
    onChange: (value: string) => void
  ) => {
    const valueMinutes = valueSeconds / 60;
    return (
      <div className="min-w-[260px] rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-white/50 text-xs uppercase tracking-wider">{label}</p>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <input
              type="number"
              min="1"
              max="999"
              value={valueMinutes}
              onChange={e => onChange(e.target.value)}
              className="w-14 bg-transparent text-right text-white font-display text-xl outline-none tabular-nums"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-white/40">min</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1">
          {presets.map(minutes => (
            <button
              key={minutes}
              type="button"
              onClick={() => onChange(minutes.toString())}
              className={cn(
                "h-9 rounded-lg text-xs font-bold transition-all",
                valueMinutes === minutes
                  ? "bg-white text-black shadow-sm"
                  : "text-white/50 hover:bg-white/10 hover:text-white"
              )}
            >
              {minutes}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const isGoalFreeTimer = mode === 'goal' && goalTimerStyle === 'free';
  const isStopwatch = mode === 'free' || isGoalFreeTimer;
  const currentTimerSnapshot = getCurrentTimerSnapshot();
  const progressDuration = getActiveTimerState() === 'break' ? breakDuration : workDuration;
  const displayTime = isStopwatch
    ? formatTime(currentTimerSnapshot.elapsedSeconds)
    : formatTime(currentTimerSnapshot.timeLeftSeconds);
  const progress = isStopwatch ? 0 : ((progressDuration - currentTimerSnapshot.timeLeftSeconds) / progressDuration) * 100;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-6 md:p-10 flex flex-col relative overflow-hidden pb-24 md:pb-10">
      {/* Ambient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: timerState === 'running' || timerState === 'break' ? [1, 1.04, 1] : 1,
            opacity: timerState === 'running' || timerState === 'break' ? [0.14, 0.2, 0.14] : 0.08
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className={cn(
            "absolute top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]",
            timerState === 'break' ? "bg-emerald-400/20" : "bg-sky-400/20"
          )}
        />
        <motion.div
          animate={{
            x: timerState === 'running' || timerState === 'break' ? ["-4%", "4%", "-4%"] : 0,
            y: timerState === 'running' || timerState === 'break' ? ["2%", "-3%", "2%"] : 0,
            opacity: timerState === 'running' || timerState === 'break' ? 0.12 : 0.06
          }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 h-[70%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300/10 blur-[170px]"
        />
      </div>

      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-12 pt-2">
          <h1 className="text-2xl font-display font-bold tracking-tight">Focus</h1>
          <div className="flex bg-white/10 p-1 rounded-full backdrop-blur-md">
            {(['goal', 'focus', 'free'] as TimerMode[]).map(m => (
              <button
                key={m}
                onClick={() => handleChangeMode(m)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors",
                  mode === m ? "bg-white text-black" : "text-white/60 hover:text-white"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Main Timer Area */}
        <div className="flex-1 flex flex-col items-center justify-center">
          
          {/* Mode Specific Settings */}
          <AnimatePresence mode="wait">
            {mode === 'goal' && timerState === 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-8 w-full max-w-md"
              >
                <select
                  value={selectedGoalId || ''}
                  onChange={(e) => {
                    setSelectedGoalId(e.target.value || null);
                    setSelectedSubTaskId(null);
                  }}
                  className="w-full bg-white/10 dark:bg-slate-800/50 border border-white/20 dark:border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 appearance-none transition-colors"
                >
                  <option value="" className="text-gray-900 dark:text-gray-200 dark:bg-slate-900">Select a goal...</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id} className="text-gray-900 dark:text-gray-200 dark:bg-slate-900">{g.title}</option>
                  ))}
                </select>
                {selectedSubTasks.length > 0 && (
                  <select
                    value={selectedSubTaskId || ''}
                    onChange={(e) => setSelectedSubTaskId(e.target.value || null)}
                    className="mt-3 w-full bg-white/10 dark:bg-slate-800/50 border border-white/20 dark:border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 appearance-none transition-colors"
                  >
                    <option value="" className="text-gray-900 dark:text-gray-200 dark:bg-slate-900">Whole goal</option>
                    {selectedSubTasks.map((st: any) => (
                      <option key={st.id} value={st.id} className="text-gray-900 dark:text-gray-200 dark:bg-slate-900">
                        {st.title} {st.actualTime ? `(${st.actualTime} min done)` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedGoal && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                    <div className="flex items-center justify-between gap-3">
                      <span>{selectedSubTask ? selectedSubTask.title : selectedGoal.title}</span>
                      <span className="font-bold text-white">
                        {selectedSubTask ? Number(selectedSubTask.actualTime || 0) : Number(selectedGoal.actualTime || 0)} min
                      </span>
                    </div>
                  </div>
                )}
                {selectedGoal?.progressType === 'duration' && (
                  <p className="mt-3 text-center text-sm text-white/50">
                    {getDurationGoalMinutes(selectedGoal)} min remaining for this goal
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1">
                  {(['timed', 'free'] as GoalTimerStyle[]).map(style => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => {
                        setGoalTimerStyle(style);
                        setElapsedTime(0);
                        setElapsedBeforeStartSeconds(0);
                        setActiveStartedAtMs(null);
                        setPausedTimerState(null);
                        setTimeLeft(workDuration);
                      }}
                      className={cn(
                        "py-2 rounded-lg text-sm font-bold capitalize transition-colors",
                        goalTimerStyle === style ? "bg-white text-black" : "text-white/50 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Timer Display */}
          <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center mb-12">
            {mode !== 'free' && (
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="4"
                />
                <motion.circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  fill="none"
                  stroke={timerState === 'break' ? "#10B981" : "#3B82F6"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  initial={{ strokeDasharray: "301.59%", strokeDashoffset: "301.59%" }}
                  animate={{ strokeDashoffset: `${301.59 - (301.59 * progress) / 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </svg>
            )}
            
            <div className="text-center">
              <div
                className="text-7xl md:text-9xl font-display font-light tracking-tighter tabular-nums drop-shadow-[0_0_28px_rgba(255,255,255,0.08)] transition-colors duration-700"
              >
                {displayTime}
              </div>
              <p className="text-white/50 font-medium mt-2 md:mt-4 uppercase tracking-widest text-sm md:text-base">
                {timerState === 'break' ? 'Break Time' : mode === 'free' || isGoalFreeTimer ? 'Stopwatch' : 'Focus Session'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 md:gap-8">
            {timerState !== 'idle' && (
              <button 
                onClick={handleStopTimerClick}
                className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <Square className="w-5 h-5 md:w-6 md:h-6 text-white" fill="currentColor" />
              </button>
            )}
            
            <button 
              onClick={toggleTimer}
              className={cn(
                "w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-lg",
                timerState === 'running' || timerState === 'break' ? "bg-white/10 text-white" : "bg-white text-black"
              )}
            >
              {timerState === 'running' || timerState === 'break' ? (
                <Pause className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" />
              ) : (
                <Play className="w-8 h-8 md:w-10 md:h-10 ml-1 md:ml-2" fill="currentColor" />
              )}
            </button>

            {timerState !== 'idle' && (
              <button 
                onClick={handleResetTimer}
                className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <RotateCcw className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Settings / Notes Footer */}
        <div className="mt-auto pt-8">
          {timerState === 'idle' && mode !== 'free' && !isGoalFreeTimer && (
            <div className="flex flex-col sm:flex-row justify-center items-stretch gap-4 mb-8">
              {renderDurationControl('Focus', workDuration, [15, 25, 30, 45, 60, 90], setFocusMinutes)}
              {mode === 'focus' && (
                renderDurationControl('Break', breakDuration, [5, 10, 15, 20], setBreakMinutes)
              )}
            </div>
          )}

          <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-sm border border-white/10 max-w-2xl mx-auto">
            <input
              type="text"
              placeholder="What are you focusing on? (Notes)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-transparent text-white placeholder-white/30 outline-none text-sm md:text-base"
            />
          </div>
        </div>
      </div>

      {/* Confirm Action Overlay */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 transition-colors"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-transparent dark:border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl transition-colors"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {confirmAction.type === 'save' ? 'Save Session?' : 
                 confirmAction.type === 'changeMode' ? 'Change Mode?' : 'Reset Timer?'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                {confirmAction.type === 'save' ? 'Do you want to save this focus session to your history?' : 
                 confirmAction.type === 'changeMode' ? 'Changing mode will stop and reset the current timer. Continue?' : 
                 'Are you sure you want to reset the timer?'}
              </p>
              <div className="flex gap-3">
                {confirmAction.type === 'save' ? (
                  <>
                    <button 
                      onClick={() => executeStopTimer(false)} 
                      className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      Discard
                    </button>
                    <button 
                      onClick={() => executeStopTimer(true)} 
                      className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:scale-95 transition-all"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => setConfirmAction(null)} 
                      className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        if (confirmAction.type === 'changeMode') executeChangeMode();
                        else if (confirmAction.type === 'reset') executeResetTimer();
                      }} 
                      className="flex-1 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-200 dark:shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95 transition-all"
                    >
                      Confirm
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
