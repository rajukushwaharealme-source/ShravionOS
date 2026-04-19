import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, CheckCircle2, XCircle, Clock, 
  TrendingUp, TrendingDown, Target, Award,
  ChevronRight, Sparkles, AlertCircle, ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { withGoalDisplayStatus } from '../lib/goal-status';
import { FOCUS_SESSIONS_UPDATED_EVENT, getFocusSessionDate, getFocusSessionSeconds, mergeFocusSessionsWithCache, roundFocusSecondsToMinutes } from '../lib/focus-session-cache';
import { startOfWeek, endOfWeek, startOfDay, endOfDay, format, isSameDay } from 'date-fns';
import {
  DEFAULT_REVIEW_SUGGESTIONS,
  REVIEW_SUGGESTIONS_UPDATED_EVENT,
  normalizeReviewSuggestions,
  readLocalReviewSuggestions,
  saveLocalReviewSuggestions
} from '../lib/review-suggestions';

type ReviewType = 'daily' | 'weekly';

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isDateInRange = (value: any, start: Date, end: Date) => {
  const date = toDate(value);
  return Boolean(date && date >= start && date <= end);
};

const isGoalScheduledForDate = (goal: any, date: Date) => {
  const startDate = toDate(goal.startDate);
  const deadline = toDate(goal.deadline);
  return Boolean((startDate && isSameDay(startDate, date)) || (deadline && isSameDay(deadline, date)));
};

const isGoalRelevantForRange = (goal: any, start: Date, end: Date) => {
  return (
    isDateInRange(goal.startDate, start, end) ||
    isDateInRange(goal.deadline, start, end) ||
    isDateInRange(goal.completedAt, start, end)
  );
};

export const Reviews = () => {
  const { user } = useAuth();
  const [reviewType, setReviewType] = useState<ReviewType>('daily');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [goals, setGoals] = useState<any[]>([]);
  const [statusClock, setStatusClock] = useState(new Date());
  const [sessions, setSessions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [reviewSuggestions, setReviewSuggestions] = useState(DEFAULT_REVIEW_SUGGESTIONS);

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
    const loadLocalSuggestions = () => setReviewSuggestions(readLocalReviewSuggestions());
    loadLocalSuggestions();
    window.addEventListener(REVIEW_SUGGESTIONS_UPDATED_EVENT, loadLocalSuggestions);
    window.addEventListener('storage', loadLocalSuggestions);
    return () => {
      window.removeEventListener(REVIEW_SUGGESTIONS_UPDATED_EVENT, loadLocalSuggestions);
      window.removeEventListener('storage', loadLocalSuggestions);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all goals
        const goalsQuery = query(collection(db, 'goals'), where('uid', '==', user.uid));
        const goalsSnap = await getDocs(goalsQuery);
        const fetchedGoals = goalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setGoals(fetchedGoals);

        // Fetch all sessions
        const sessionsQuery = query(collection(db, 'pomodoroSessions'), where('uid', '==', user.uid));
        const sessionsSnap = await getDocs(sessionsQuery);
        const fetchedSessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSessions(mergeFocusSessionsWithCache(fetchedSessions.filter((s: any) => !s.isTimeBlock)));

        // Fetch categories
        const catQuery = query(collection(db, 'categories'), where('uid', '==', user.uid));
        const catSnap = await getDocs(catQuery);
        const cats = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCategories(cats);
        
        // Derive subjects from categories
        const allSubjects = cats.flatMap((c: any) => (c.subjects || []).map((s: any) => ({ ...s, categoryId: c.id })));
        setSubjects(allSubjects);

        try {
          const suggestionsSnap = await getDoc(doc(db, 'reviewSettings', 'global'));
          const suggestions = suggestionsSnap.exists()
            ? normalizeReviewSuggestions(suggestionsSnap.data())
            : DEFAULT_REVIEW_SUGGESTIONS;
          setReviewSuggestions(suggestions);
          saveLocalReviewSuggestions(suggestions);
        } catch (error) {
          console.error("Error fetching review suggestions:", error);
          setReviewSuggestions(readLocalReviewSuggestions());
        }
      } catch (error) {
        console.error("Error fetching review data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const displayedGoals = goals.map(goal => withGoalDisplayStatus(goal, statusClock));

  // Daily Review Logic
  const generateDailyReview = () => {
    const now = statusClock;
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const plannedToday = displayedGoals.filter(g => {
      return (
        isGoalScheduledForDate(g, now) ||
        isDateInRange(g.completedAt, todayStart, todayEnd)
      );
    });

    const completedToday = plannedToday.filter(g => g.status === 'completed' || isDateInRange(g.completedAt, todayStart, todayEnd));
    const missedToday = plannedToday.filter(g => g.status === 'missed');
    const pendingToday = plannedToday.filter(g => g.status !== 'completed' && g.status !== 'missed');
    const completionRate = plannedToday.length > 0 ? Math.round((completedToday.length / plannedToday.length) * 100) : 0;

    return {
      planned: plannedToday,
      completed: completedToday,
      missed: missedToday,
      pending: pendingToday,
      completionRate
    };
  };

  // Weekly Review Logic
  const generateWeeklyReview = () => {
    const now = statusClock;
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const thisWeekGoals = displayedGoals.filter(g => {
      return isGoalRelevantForRange(g, weekStart, weekEnd);
    });

    const completedThisWeek = thisWeekGoals.filter(g => g.status === 'completed' || isDateInRange(g.completedAt, weekStart, weekEnd));
    const missedThisWeek = thisWeekGoals.filter(g => g.status === 'missed');
    const pendingThisWeek = thisWeekGoals.filter(g => g.status !== 'completed' && g.status !== 'missed');
    const completionRate = thisWeekGoals.length > 0 ? Math.round((completedThisWeek.length / thisWeekGoals.length) * 100) : 0;

    const thisWeekSessions = sessions.filter(s => {
      const d = getFocusSessionDate(s);
      if (!d) return false;
      return d >= weekStart && d <= weekEnd;
    });

    const totalFocusMinutes = roundFocusSecondsToMinutes(thisWeekSessions.reduce((acc, s) => acc + getFocusSessionSeconds(s), 0));

    // Category and Subject analysis
    const categoryStats: Record<string, { completed: number, total: number }> = {};
    const subjectStats: Record<string, { completed: number, total: number }> = {};

    thisWeekGoals.forEach(g => {
      if (g.categoryId) {
        if (!categoryStats[g.categoryId]) categoryStats[g.categoryId] = { completed: 0, total: 0 };
        categoryStats[g.categoryId].total++;
        if (g.status === 'completed') categoryStats[g.categoryId].completed++;
      }
      if (g.subjectId) {
        if (!subjectStats[g.subjectId]) subjectStats[g.subjectId] = { completed: 0, total: 0 };
        subjectStats[g.subjectId].total++;
        if (g.status === 'completed') subjectStats[g.subjectId].completed++;
      }
    });

    let bestCatId = null;
    let bestCatRate = -1;
    let worstCatId = null;
    let worstCatRate = 101;

    Object.entries(categoryStats).forEach(([catId, stats]) => {
      if (stats.total > 0) {
        const rate = (stats.completed / stats.total) * 100;
        if (rate > bestCatRate) {
          bestCatRate = rate;
          bestCatId = catId;
        }
        if (rate < worstCatRate) {
          worstCatRate = rate;
          worstCatId = catId;
        }
      }
    });

    let bestSubId = null;
    let bestSubRate = -1;
    Object.entries(subjectStats).forEach(([subId, stats]) => {
      if (stats.total > 0) {
        const rate = (stats.completed / stats.total) * 100;
        if (rate > bestSubRate) {
          bestSubRate = rate;
          bestSubId = subId;
        }
      }
    });

    const bestCategory = categories.find(c => c.id === bestCatId);
    const worstCategory = categories.find(c => c.id === worstCatId);
    const bestSubject = subjects.find(s => s.id === bestSubId);

    // Day analysis
    const dayStats: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }; // 0 = Sunday
    completedThisWeek.forEach(g => {
      if (g.completedAt) {
        dayStats[g.completedAt.toDate().getDay()]++;
      }
    });

    let bestDay = 0;
    let maxGoals = -1;
    let worstDay = 0;
    let minGoals = 999;

    Object.entries(dayStats).forEach(([dayStr, count]) => {
      const day = parseInt(dayStr);
      if (count > maxGoals) { maxGoals = count; bestDay = day; }
      if (count < minGoals) { minGoals = count; worstDay = day; }
    });

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Suggestions
    const suggestions = [];
    if (totalFocusMinutes < 120) {
      suggestions.push("Try to schedule at least two 60-minute deep work sessions next week.");
    }
    if (missedThisWeek.length > completedThisWeek.length) {
      suggestions.push("You missed more goals than you completed. Consider reducing your planned tasks by 20% next week to build momentum.");
    }
    if (thisWeekGoals.length > 0 && completionRate < 60) {
      suggestions.push(`This week's completion rate is ${completionRate}%. Keep fewer goals, make them smaller, and protect focus blocks.`);
    }
    if (worstCategory) {
      suggestions.push(`Your completion rate for "${worstCategory.name}" was low. Try breaking these tasks into smaller, more manageable steps.`);
    }
    if (suggestions.length === 0) {
      suggestions.push("Great week! Keep up the consistent effort and maintain your current routines.");
    }

    return {
      weekStart,
      weekEnd,
      planned: thisWeekGoals,
      pending: pendingThisWeek,
      completed: completedThisWeek.length,
      completedGoals: completedThisWeek,
      missed: missedThisWeek.length,
      missedGoals: missedThisWeek,
      completionRate,
      focusMinutes: totalFocusMinutes,
      bestCategory,
      worstCategory,
      bestSubject,
      bestDay: daysOfWeek[bestDay],
      worstDay: daysOfWeek[worstDay],
      suggestions
    };
  };

  const daily = generateDailyReview();
  const weekly = generateWeeklyReview();
  const weeklySuggestions = reviewSuggestions.weeklySuggestions.length > 0
    ? reviewSuggestions.weeklySuggestions
    : weekly.suggestions;

  if (loading) {
    return (
      <div className="p-6 pb-32 flex items-center justify-center min-h-screen dark:bg-transparent transition-colors duration-300">
        <div className="animate-pulse flex flex-col items-center">
          <Sparkles className="w-8 h-8 text-blue-500 mb-4 animate-bounce" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Generating your insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-10 pb-32 max-w-5xl mx-auto min-h-screen transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">Reviews</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Smart insights and reflections</p>
        </div>
        
        <div className="flex bg-gray-100 dark:bg-slate-900 p-1 rounded-xl border border-transparent dark:border-white/10 transition-colors duration-300">
          <button
            onClick={() => setReviewType('daily')}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
              reviewType === 'daily' ? "bg-white dark:bg-blue-600/20 text-gray-900 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
            )}
          >
            Daily Review
          </button>
          <button
            onClick={() => setReviewType('weekly')}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
              reviewType === 'weekly' ? "bg-white dark:bg-blue-600/20 text-gray-900 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
            )}
          >
            Weekly Insights
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {reviewType === 'daily' ? (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-8 text-white shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
              <h2 className="text-2xl font-display font-bold mb-2 relative z-10">Today's Reflection</h2>
              <p className="text-blue-100 relative z-10">{format(new Date(), 'EEEE, MMMM do')}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 relative z-10">
                <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
                  <p className="text-blue-200 text-sm font-medium mb-1">Planned</p>
                  <p className="text-3xl font-display font-bold">{daily.planned.length}</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
                  <p className="text-blue-200 text-sm font-medium mb-1">Completed</p>
                  <p className="text-3xl font-display font-bold">{daily.completed.length}</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
                  <p className="text-blue-200 text-sm font-medium mb-1">Missed</p>
                  <p className="text-3xl font-display font-bold">{daily.missed.length}</p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
                  <p className="text-blue-200 text-sm font-medium mb-1">Completion Rate</p>
                  <p className="text-3xl font-display font-bold">
                    {daily.completionRate}%
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reviewSuggestions.todaySuggestion && (
                <div className="md:col-span-3 bg-amber-50 dark:bg-amber-500/10 rounded-[1.5rem] p-6 border border-amber-100 dark:border-amber-500/10 shadow-sm dark:shadow-none transition-colors duration-300">
                  <h3 className="text-lg font-bold text-amber-900 dark:text-amber-200 mb-3 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    Today's Suggestion
                  </h3>
                  <p className="text-amber-900 dark:text-amber-100 font-medium leading-relaxed">{reviewSuggestions.todaySuggestion}</p>
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  Planned Today
                </h3>
                {daily.planned.length > 0 ? (
                  <ul className="space-y-3">
                    {daily.planned.map(g => (
                      <li key={g.id} className="flex items-center justify-between gap-3 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 transition-colors">
                        <span className="font-medium truncate">{g.title}</span>
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                          g.status === 'completed' && "bg-green-100 text-green-700 dark:bg-emerald-500/10 dark:text-emerald-400",
                          g.status === 'missed' && "bg-red-100 text-red-700 dark:bg-rose-500/10 dark:text-rose-400",
                          g.status !== 'completed' && g.status !== 'missed' && "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                        )}>
                          {g.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No goals planned for today.</p>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-emerald-400" />
                  Completed Today
                </h3>
                {daily.completed.length > 0 ? (
                  <ul className="space-y-3">
                    {daily.completed.map(g => (
                      <li key={g.id} className="flex items-center gap-3 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-emerald-500"></div>
                        <span className="font-medium">{g.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No goals completed today yet.</p>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500 dark:text-rose-400" />
                  Missed Today
                </h3>
                {daily.missed.length > 0 ? (
                  <ul className="space-y-3">
                    {daily.missed.map(g => (
                      <li key={g.id} className="flex items-center gap-3 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-rose-400"></div>
                        <span className="font-medium">{g.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No missed goals today.</p>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="weekly"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div>
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-4">
                {format(weekly.weekStart, 'MMM d')} - {format(weekly.weekEnd, 'MMM d, yyyy')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex items-center gap-4 transition-colors duration-300">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Planned</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-display font-bold text-gray-900 dark:text-white">{weekly.planned.length}</p>
                    <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">goals</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex items-center gap-4 transition-colors duration-300">
                <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Goals Met</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-display font-bold text-gray-900 dark:text-white">{weekly.completed}</p>
                    <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">this week</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex items-center gap-4 transition-colors duration-300">
                <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6 text-red-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Goals Missed</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-display font-bold text-gray-900 dark:text-white">{weekly.missed}</p>
                    <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">this week</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex items-center gap-4 transition-colors duration-300">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Completion</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-display font-bold text-gray-900 dark:text-white">{weekly.completionRate}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex items-center gap-4 transition-colors duration-300 md:col-span-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Focus Time</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-display font-bold text-gray-900 dark:text-white">
                      {Math.floor(weekly.focusMinutes / 60)}<span className="text-lg ml-1 text-gray-500 dark:text-gray-400">h</span> {weekly.focusMinutes % 60}<span className="text-lg ml-1 text-gray-500 dark:text-gray-400">m</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-emerald-400" />
                  Completed This Week
                </h3>
                {weekly.completedGoals.length > 0 ? (
                  <ul className="space-y-3">
                    {weekly.completedGoals.slice(0, 6).map((g: any) => (
                      <li key={g.id} className="flex items-center gap-3 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-emerald-500"></div>
                        <span className="font-medium">{g.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No completed goals this week yet.</p>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500 dark:text-rose-400" />
                  Missed This Week
                </h3>
                {weekly.missedGoals.length > 0 ? (
                  <ul className="space-y-3">
                    {weekly.missedGoals.slice(0, 6).map((g: any) => (
                      <li key={g.id} className="flex items-center gap-3 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-rose-400"></div>
                        <span className="font-medium">{g.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No missed goals this week.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                  Performance Highlights
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2">Most Productive Category</p>
                    <div className="flex items-center gap-3">
                      {weekly.bestCategory ? (
                        <>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${weekly.bestCategory.color}15`, color: weekly.bestCategory.color }}>
                            <Award className="w-5 h-5" />
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white text-lg">{weekly.bestCategory.name}</span>
                        </>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 italic">Not enough data</span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-px bg-gray-100 dark:bg-white/5 transition-colors"></div>

                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2">Most Productive Subject</p>
                    <div className="flex items-center gap-3">
                      {weekly.bestSubject ? (
                        <>
                          <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-emerald-500/10 flex items-center justify-center transition-colors">
                            <Target className="w-5 h-5 text-green-600 dark:text-emerald-400" />
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white text-lg">{weekly.bestSubject.name}</span>
                        </>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 italic">Not enough data</span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-px bg-gray-100 dark:bg-white/5 transition-colors"></div>

                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2">Best Day</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center transition-colors">
                        <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white text-lg">{weekly.bestDay}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
                <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <AlertCircle className="w-6 h-6 text-orange-500 dark:text-orange-400" />
                  Areas for Improvement
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2">Weakest Area</p>
                    <div className="flex items-center gap-3">
                      {weekly.worstCategory ? (
                        <>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${weekly.worstCategory.color}15`, color: weekly.worstCategory.color }}>
                            <TrendingDown className="w-5 h-5" />
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white text-lg">{weekly.worstCategory.name}</span>
                        </>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 italic">Not enough data</span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-px bg-gray-100 dark:bg-white/5 transition-colors"></div>

                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-2">Lowest Energy Day</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center transition-colors">
                        <Calendar className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white text-lg">{weekly.worstDay}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Suggestions */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-[2rem] p-8 border border-indigo-100 dark:border-indigo-500/10 transition-colors duration-300">
              <h3 className="text-xl font-display font-bold text-indigo-900 dark:text-indigo-300 mb-6 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                Smart Suggestions for Next Week
              </h3>
              <ul className="space-y-4">
                {weeklySuggestions.map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm rounded-xl p-4 border border-white dark:border-white/5 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{idx + 1}</span>
                    </div>
                    <p className="text-indigo-900 dark:text-indigo-100 font-medium leading-relaxed">{suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
