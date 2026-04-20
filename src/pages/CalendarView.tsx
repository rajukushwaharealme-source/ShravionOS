import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isFuture, 
  startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, subDays, addDays, parseISO, differenceInCalendarDays
} from 'date-fns';
import { cn } from '../lib/utils';
import { withGoalDisplayStatus } from '../lib/goal-status';
import { FOCUS_SESSION_RETENTION_DAYS_LABEL, FOCUS_SESSIONS_UPDATED_EVENT, getFocusSessionDate, getFocusSessionSeconds, mergeFocusSessionsWithCache, roundFocusSecondsToMinutes } from '../lib/focus-session-cache';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Target, CheckCircle2, AlertCircle, X, AlignLeft } from 'lucide-react';
import { TimelineView } from '../components/TimelineView';

type ViewMode = 'month' | 'week' | 'timeline';

const toCalendarDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const CalendarView = () => {
  const { user, profile } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [statusClock, setStatusClock] = useState(new Date());
  const [sessions, setSessions] = useState<any[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDayDetails, setShowDayDetails] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => setStatusClock(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const refreshCachedSessions = () => setSessions(prev => mergeFocusSessionsWithCache(prev));
    window.addEventListener(FOCUS_SESSIONS_UPDATED_EVENT, refreshCachedSessions);
    window.addEventListener('storage', refreshCachedSessions);
    return () => {
      window.removeEventListener(FOCUS_SESSIONS_UPDATED_EVENT, refreshCachedSessions);
      window.removeEventListener('storage', refreshCachedSessions);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubGoals = onSnapshot(query(collection(db, 'goals'), where('uid', '==', user.uid)), (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    const unsubSessions = onSnapshot(query(collection(db, 'pomodoroSessions'), where('uid', '==', user.uid)), (snapshot) => {
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const regularSessions = allDocs.filter((s: any) => !s.isTimeBlock);
      const blocks = allDocs.filter((s: any) => s.isTimeBlock);
      
      setSessions(mergeFocusSessionsWithCache(regularSessions));
      setTimeBlocks(blocks);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pomodoroSessions'));

    return () => {
      unsubGoals();
      unsubSessions();
    };
  }, [user]);

  const displayedGoals = useMemo(() => {
    return goals.map(goal => withGoalDisplayStatus(goal, statusClock));
  }, [goals, statusClock]);

  const daysToDisplay = useMemo(() => {
    if (viewMode === 'month') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const startDate = startOfWeek(monthStart);
      const endDate = endOfWeek(monthEnd);
      return eachDayOfInterval({ start: startDate, end: endDate });
    } else {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }
  }, [currentDate, viewMode]);

  const getDayData = (date: Date) => {
    // Goals planned for this day
    const dayGoals = displayedGoals.filter(g => {
      if (g.deadline && isSameDay(g.deadline.toDate(), date)) return true;
      if (g.completedAt && isSameDay(g.completedAt.toDate(), date)) return true;
      if (g.createdAt && isSameDay(g.createdAt.toDate(), date) && g.type === 'daily') return true;
      return false;
    });

    const completedGoals = dayGoals.filter(g => g.status === 'completed');
    const missedGoals = dayGoals.filter(g => g.status === 'missed' || (g.status === 'pending' && g.deadline && g.deadline.toDate() < new Date() && !isToday(date)));
    
    // Focus time
    const daySessions = sessions.filter(s => {
      const sessionDate = getFocusSessionDate(s);
      return sessionDate && isSameDay(sessionDate, date);
    });
    const focusSeconds = daySessions.reduce((acc, s) => acc + getFocusSessionSeconds(s), 0);
    
    // Planned Time Blocks
    const dayBlocks = timeBlocks.filter(b => b.startTime && isSameDay(b.startTime.toDate ? b.startTime.toDate() : new Date(b.startTime), date));
    const plannedSeconds = dayBlocks.reduce((acc, b) => {
      const start = b.startTime.toDate ? b.startTime.toDate() : new Date(b.startTime);
      const end = b.endTime.toDate ? b.endTime.toDate() : new Date(b.endTime);
      return acc + (end.getTime() - start.getTime()) / 1000;
    }, 0);

    let status = 'empty';
    if (dayGoals.length > 0) {
      if (completedGoals.length === dayGoals.length) status = 'perfect';
      else if (completedGoals.length > 0) status = 'partial';
      else if (missedGoals.length > 0) status = 'missed';
      else if (isFuture(date) && !isToday(date)) status = 'future';
      else status = 'inactive';
    } else if (focusSeconds > 0 || plannedSeconds > 0) {
      status = 'partial'; // Did some focus time or had plans
    }

    return {
      goals: dayGoals,
      completedGoals,
      missedGoals,
      focusSeconds,
      plannedSeconds,
      sessions: daySessions,
      status
    };
  };

  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };

  const selectedDayData = getDayData(selectedDate);
  const signupDate = useMemo(() => {
    return toCalendarDate(profile?.createdAt) || toCalendarDate(user?.metadata.creationTime);
  }, [profile?.createdAt, user?.metadata.creationTime]);

  const recentFocusDays = useMemo(() => {
    const daysSinceSignup = signupDate
      ? Math.max(1, differenceInCalendarDays(statusClock, signupDate) + 1)
      : 30;
    const daysToShow = Math.min(30, daysSinceSignup);

    return Array.from({ length: daysToShow }, (_, index) => {
      const date = subDays(statusClock, index);
      const focusSeconds = sessions.reduce((acc, session) => {
        const sessionDate = getFocusSessionDate(session);
        return sessionDate && isSameDay(sessionDate, date) ? acc + getFocusSessionSeconds(session) : acc;
      }, 0);

      return {
        date,
        focusSeconds,
        focusMinutes: roundFocusSecondsToMinutes(focusSeconds)
      };
    });
  }, [sessions, signupDate, statusClock]);

  if (loading) {
    return <div className="p-4 sm:p-6 pb-24 animate-pulse dark:bg-transparent dark:text-white min-h-screen transition-colors duration-300">Loading calendar...</div>;
  }

  return (
    <div className="px-3 py-5 sm:p-6 md:p-8 lg:p-10 pb-28 sm:pb-32 max-w-7xl mx-auto min-h-screen text-gray-900 dark:text-gray-100 transition-colors duration-300 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5 sm:mb-8 pt-2 sm:pt-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">Calendar</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">Plan and review your productivity</p>
        </div>
        
        <div className="grid grid-cols-3 gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300 w-full md:w-auto">
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              "px-2 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2",
              viewMode === 'timeline' ? "bg-gray-900 dark:bg-blue-600/20 text-white dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            <AlignLeft className="w-4 h-4 hidden md:block" /> Timeline
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={cn(
              "px-2 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors",
              viewMode === 'week' ? "bg-gray-900 dark:bg-blue-600/20 text-white dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={cn(
              "px-2 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors",
              viewMode === 'month' ? "bg-gray-900 dark:bg-blue-600/20 text-white dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            Month
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
        {/* Calendar Navigation & Grid */}
        <div className="lg:col-span-2">
          {viewMode === 'timeline' ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-gray-900 dark:text-white">
                  {format(currentDate, 'EEEE, MMMM d')}
                </h2>
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-sm font-bold text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    Today
                  </button>
                  <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">Tap anywhere on the timeline to create a block</p>
              
              <TimelineView date={currentDate} blocks={timeBlocks} goals={displayedGoals} />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-gray-900 dark:text-white">
                  {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : 'MMM d, yyyy')}
                </h2>
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <button onClick={handlePrev} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-sm font-bold text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    Today
                  </button>
                  <button onClick={handleNext} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Days Header */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 md:gap-4 mb-3 sm:mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <span className="hidden sm:inline">{day}</span>
                    <span className="sm:hidden">{day.slice(0, 1)}</span>
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 md:gap-4">
                {daysToDisplay.map(date => {
                  const data = getDayData(date);
                  const isSelected = isSameDay(date, selectedDate);
                  const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                  
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => {
                        setSelectedDate(date);
                        // Only show modal on mobile, desktop uses the side panel
                        if (window.innerWidth < 1024) {
                          setShowDayDetails(true);
                        }
                      }}
                      className={cn(
                        "aspect-square min-h-9 flex flex-col items-center justify-center relative rounded-xl sm:rounded-2xl transition-all border",
                        isSelected ? "border-gray-900 dark:border-white shadow-md dark:shadow-[0_0_15px_rgba(255,255,255,0.1)] sm:scale-105 z-10" : "border-transparent hover:border-gray-200 dark:hover:border-white/20",
                        !isCurrentMonth && viewMode === 'month' ? "opacity-30" : "opacity-100",
                        data.status === 'perfect' && "bg-green-500 dark:bg-emerald-500 text-white dark:shadow-[0_0_10px_rgba(16,185,129,0.3)]",
                        data.status === 'partial' && "bg-green-100 dark:bg-emerald-500/20 text-green-900 dark:text-emerald-400",
                        data.status === 'missed' && "bg-red-50 dark:bg-rose-500/20 text-red-900 dark:text-rose-400",
                        data.status === 'empty' && "bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-gray-500",
                        data.status === 'future' && "bg-white dark:bg-slate-900 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-white/5 border-dashed border",
                        data.status === 'inactive' && "bg-gray-100 dark:bg-slate-800/80 text-gray-500 dark:text-gray-600"
                      )}
                    >
                      <span className={cn(
                        "text-xs sm:text-sm md:text-base font-bold",
                        isToday(date) && !isSelected && "text-blue-600 dark:text-blue-400"
                      )}>
                        {format(date, 'd')}
                      </span>
                      
                      {/* Heatmap indicators */}
                      {data.focusSeconds > 0 && (
                        <div className="absolute bottom-1.5 sm:bottom-2 flex gap-0.5">
                          <div className={cn(
                            "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full",
                            data.status === 'perfect' ? "bg-white/80" : "bg-indigo-500 dark:bg-indigo-400"
                          )} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-100 dark:border-white/5 grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-6 justify-center text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 dark:bg-emerald-500"></div>
                  <span>Perfect Day</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-100 dark:bg-emerald-500/20"></div>
                  <span>Partial</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-50 dark:bg-rose-500/20"></div>
                  <span>Missed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500 dark:bg-indigo-400"></div>
                  <span>Focus Time</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Side Panel for Day Details */}
        <div className="hidden lg:block">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none sticky top-8 transition-colors duration-300">
            <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-6">
              {format(selectedDate, 'EEEE, MMMM d')}
            </h3>
            
            <div className="space-y-6">
              {/* Focus Time Summary */}
              <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl p-4 flex flex-col gap-4 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Focus Time</p>
                    <p className="text-2xl font-display font-bold text-indigo-700 dark:text-indigo-400">
                      {roundFocusSecondsToMinutes(selectedDayData.focusSeconds)}<span className="text-sm font-medium text-indigo-500 dark:text-indigo-500/70 ml-1">min actual</span>
                    </p>
                  </div>
                </div>
                {selectedDayData.plannedSeconds > 0 && (
                  <div className="pt-3 border-t border-indigo-200 dark:border-indigo-500/20 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-bold text-indigo-500 dark:text-indigo-500/70">Planned</p>
                      <p className="text-sm font-bold text-indigo-900 dark:text-indigo-300">{Math.round(selectedDayData.plannedSeconds / 60)}m block(s)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider font-bold text-indigo-500 dark:text-indigo-500/70">Diff</p>
                      <p className={cn(
                        "text-sm font-bold", 
                        selectedDayData.focusSeconds >= selectedDayData.plannedSeconds 
                          ? "text-emerald-600 dark:text-emerald-400" 
                          : "text-rose-600 dark:text-rose-400"
                      )}>
                        {selectedDayData.focusSeconds >= selectedDayData.plannedSeconds ? '+' : '-'}
                        {roundFocusSecondsToMinutes(Math.abs(selectedDayData.focusSeconds - selectedDayData.plannedSeconds))}m
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-indigo-200 dark:border-indigo-500/20">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-500/70">Last 30 Days</p>
                    <p className="text-[11px] font-medium text-indigo-500/70 dark:text-indigo-400/60">Rolling {FOCUS_SESSION_RETENTION_DAYS_LABEL}</p>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {recentFocusDays.map(day => {
                      const isActiveDay = isSameDay(day.date, selectedDate);

                      return (
                        <button
                          key={day.date.toISOString()}
                          onClick={() => {
                            setSelectedDate(day.date);
                            setCurrentDate(day.date);
                          }}
                          className={cn(
                            "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                            isActiveDay
                              ? "border-indigo-400 bg-indigo-100 text-indigo-950 dark:border-indigo-400/60 dark:bg-indigo-500/20 dark:text-indigo-100"
                              : "border-indigo-100/70 bg-white/60 text-indigo-900 hover:border-indigo-300 dark:border-indigo-500/10 dark:bg-slate-900/40 dark:text-indigo-200 dark:hover:border-indigo-400/40"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{isToday(day.date) ? 'Today' : format(day.date, 'dd-MM-yy')}</p>
                              <p className="text-[11px] font-medium opacity-70">{format(day.date, 'EEEE')}</p>
                            </div>
                            <p className="text-sm font-display font-bold">
                              {day.focusMinutes}<span className="ml-1 text-xs font-medium opacity-70">min</span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Goals Summary */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Tasks</h4>
                {selectedDayData.goals.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDayData.goals.map(goal => (
                      <div key={goal.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-white/5 transition-colors">
                        {goal.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                        ) : goal.status === 'missed' ? (
                          <AlertCircle className="w-5 h-5 text-red-500 dark:text-rose-400 shrink-0 mt-0.5" />
                        ) : (
                          <Target className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-200">{goal.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{goal.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No tasks planned for this day.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Day Details Modal (Mobile Only) */}
      <AnimatePresence>
        {showDayDetails && window.innerWidth < 1024 && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDayDetails(false)}
              className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-colors"
            />
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="fixed bottom-0 left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:max-w-lg bg-white dark:bg-slate-900 rounded-t-[1.75rem] md:rounded-[2rem] shadow-2xl z-50 max-h-[88vh] overflow-y-auto lg:hidden border border-transparent dark:border-white/10 transition-colors"
            >
              <div className="p-4 sm:p-6">
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 dark:bg-white/10 md:hidden" />
                <div className="flex justify-between items-start mb-5 sm:mb-6">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-display font-bold text-gray-900 dark:text-white">
                      {format(selectedDate, 'EEEE')}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">{format(selectedDate, 'MMMM d, yyyy')}</p>
                  </div>
                  <button 
                    onClick={() => setShowDayDetails(false)}
                    className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
                  <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-2xl transition-colors">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                      <Target className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Goals</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedDayData.completedGoals.length} <span className="text-sm text-gray-400 dark:text-gray-500">/ {selectedDayData.goals.length}</span>
                    </p>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-500/10 p-3 sm:p-4 rounded-2xl transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Focus</span>
                      </div>
                      <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">
                        {roundFocusSecondsToMinutes(selectedDayData.focusSeconds)} <span className="text-sm text-indigo-400 dark:text-indigo-500">min</span>
                      </p>
                    </div>
                    {selectedDayData.plannedSeconds > 0 && (
                      <div className="mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-500/20 text-xs">
                        <span className="text-indigo-500 dark:text-indigo-500/70 font-medium whitespace-nowrap">Planned: {Math.round(selectedDayData.plannedSeconds / 60)}m</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6 sm:mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 sm:p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Last 30 Days</p>
                    <p className="text-[11px] font-medium text-indigo-500/70 dark:text-indigo-400/60">Rolling {FOCUS_SESSION_RETENTION_DAYS_LABEL}</p>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {recentFocusDays.map(day => {
                      const isActiveDay = isSameDay(day.date, selectedDate);

                      return (
                        <button
                          key={day.date.toISOString()}
                          onClick={() => {
                            setSelectedDate(day.date);
                            setCurrentDate(day.date);
                          }}
                          className={cn(
                            "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                            isActiveDay
                              ? "border-indigo-400 bg-white text-indigo-950 dark:border-indigo-400/60 dark:bg-indigo-500/20 dark:text-indigo-100"
                              : "border-indigo-100 bg-white/60 text-indigo-900 dark:border-indigo-500/10 dark:bg-slate-900/40 dark:text-indigo-200"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{isToday(day.date) ? 'Today' : format(day.date, 'dd-MM-yy')}</p>
                              <p className="text-[11px] font-medium opacity-70">{format(day.date, 'EEEE')}</p>
                            </div>
                            <p className="text-sm font-display font-bold">
                              {day.focusMinutes}<span className="ml-1 text-xs font-medium opacity-70">min</span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-6">
                  {selectedDayData.goals.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3">Goals</h4>
                      <div className="space-y-2">
                        {selectedDayData.goals.map(goal => (
                          <div key={goal.id} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800/80 border border-gray-100 dark:border-white/5 rounded-xl shadow-sm dark:shadow-none transition-colors">
                            {goal.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-emerald-400 shrink-0" />
                            ) : goal.status === 'missed' ? (
                              <AlertCircle className="w-5 h-5 text-red-500 dark:text-rose-400 shrink-0" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />
                            )}
                            <span className={cn(
                              "text-sm font-medium transition-colors",
                              goal.status === 'completed' ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-200"
                            )}>
                              {goal.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDayData.sessions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3">Focus Sessions</h4>
                      <div className="space-y-2">
                        {selectedDayData.sessions.map(session => (
                          <div key={session.id || session.clientSessionId} className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-100/50 dark:border-indigo-500/20 rounded-xl transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-200 capitalize">{session.sessionType || 'Focus'} Session</p>
                                {session.notes && <p className="text-xs text-gray-500 dark:text-gray-400">{session.notes}</p>}
                              </div>
                            </div>
                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                              {roundFocusSecondsToMinutes(getFocusSessionSeconds(session))}m
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDayData.goals.length === 0 && selectedDayData.sessions.length === 0 && (
                    <div className="text-center py-8">
                      <CalendarIcon className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-gray-400 font-medium">No activity recorded for this day.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
