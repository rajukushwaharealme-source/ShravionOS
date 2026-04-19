import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { CheckCircle2, Circle, Flame, Target, ChevronRight, Plus, Sparkles, ListTodo, Clock, AlertCircle, TrendingUp, BrainCircuit, Activity, Play } from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek, isBefore, startOfDay } from 'date-fns';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { withGoalDisplayStatus } from '../lib/goal-status';
import { FOCUS_SESSIONS_UPDATED_EVENT, getFocusSessionDate, getFocusSessionSeconds, mergeFocusSessionsWithCache, roundFocusSecondsToMinutes } from '../lib/focus-session-cache';
import { InstallShravionButton } from '../components/PWAInstallPrompt';
import { motion } from 'motion/react';

const ALLOWED_GOAL_TYPES = ['daily', 'weekly', 'monthly', 'one-time'];
const ALLOWED_PROGRESS_TYPES = ['checkbox', 'percentage', 'duration'];
const normalizeGoalType = (value?: string) => ALLOWED_GOAL_TYPES.includes(value || '') ? value! : 'one-time';
const normalizeProgressType = (value?: string) => ALLOWED_PROGRESS_TYPES.includes(value || '') ? value! : 'checkbox';
const getStatusLabel = (status: string) => status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
const FOCUS_TIMER_STORAGE_KEY = 'focusApp.activeTimer.v1';

export const Dashboard = () => {
  const { user, profile } = useAuth();
  const [allGoals, setAllGoals] = useState<any[]>([]);
  const [timerSessions, setTimerSessions] = useState<any[]>([]);
  const [statusClock, setStatusClock] = useState(new Date());
  const [focusClock, setFocusClock] = useState(new Date());
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const intervalId = window.setInterval(() => setStatusClock(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setFocusClock(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const refreshCachedSessions = () => setTimerSessions(prev => mergeFocusSessionsWithCache(prev));
    window.addEventListener(FOCUS_SESSIONS_UPDATED_EVENT, refreshCachedSessions);
    window.addEventListener('storage', refreshCachedSessions);
    return () => {
      window.removeEventListener(FOCUS_SESSIONS_UPDATED_EVENT, refreshCachedSessions);
      window.removeEventListener('storage', refreshCachedSessions);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const qGoals = query(collection(db, 'goals'), where('uid', '==', user.uid));
    const unsubGoals = onSnapshot(qGoals, (snapshot) => {
      const enrichedGoals = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data
        };
      });
      setAllGoals(enrichedGoals);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    const qCat = query(collection(db, 'categories'), where('uid', '==', user.uid));
    const unsubCat = onSnapshot(qCat, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    const qSessions = query(collection(db, 'pomodoroSessions'), where('uid', '==', user.uid));
    const unsubSessions = onSnapshot(qSessions, (snapshot) => {
      const sessions = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((session: any) => !session.isTimeBlock);
      setTimerSessions(mergeFocusSessionsWithCache(sessions));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pomodoroSessions'));

    return () => {
      unsubGoals();
      unsubCat();
      unsubSessions();
    };
  }, [user]);

  const displayedGoals = useMemo(() => {
    return allGoals.map(goal => withGoalDisplayStatus(goal, statusClock));
  }, [allGoals, statusClock]);

  const toggleGoalStatus = async (goalId: string, currentStatus: string, goalSubTasks?: any[], progressType?: string, targetValue?: number, goalType?: string) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      const safeProgressType = normalizeProgressType(progressType);
      const goalRef = doc(db, 'goals', goalId);
      const updateData: any = {
        type: normalizeGoalType(goalType),
        progressType: safeProgressType,
        status: newStatus,
        completedAt: newStatus === 'completed' ? serverTimestamp() : deleteField()
      };
      
      if (goalSubTasks && goalSubTasks.length > 0) {
         updateData.subTasks = goalSubTasks.map((st: any) => ({ ...st, completed: newStatus === 'completed' }));
      }

      if (safeProgressType === 'percentage' && newStatus === 'completed') {
          updateData.completedValue = 100;
          updateData.targetValue = 100;
      } else if (safeProgressType === 'percentage' && newStatus === 'pending') {
          updateData.completedValue = 0;
      }

      if (safeProgressType === 'duration' && newStatus === 'completed') {
          updateData.completedValue = targetValue || 0;
          updateData.actualTime = targetValue || 0;
      } else if (safeProgressType === 'duration' && newStatus === 'pending') {
          updateData.completedValue = 0;
          updateData.actualTime = 0;
      }
      
      await updateDoc(goalRef, updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goals/${goalId}`);
    }
  };

  // Calculations
  const todayStart = startOfDay(new Date());
  const getGoalDate = (value: any) => {
    if (!value) return null;
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const isGoalScheduledToday = (goal: any) => {
    const startDate = getGoalDate(goal.startDate);
    const deadline = getGoalDate(goal.deadline);
    return Boolean((startDate && isToday(startDate)) || (deadline && isToday(deadline)));
  };
  const isGoalWithoutDate = (goal: any) => {
    return !getGoalDate(goal.startDate) && !getGoalDate(goal.deadline);
  };

  const todayGoals = displayedGoals.filter(goal => {
    return isGoalScheduledToday(goal);
  }).sort((a, b) => {
    const aDate = getGoalDate(a.startDate) || getGoalDate(a.deadline) || new Date();
    const bDate = getGoalDate(b.startDate) || getGoalDate(b.deadline) || new Date();
    return aDate.getTime() - bDate.getTime();
  });

  const noDateGoals = displayedGoals.filter(isGoalWithoutDate);

  const overdueGoals = displayedGoals.filter(goal => {
    if (!goal.deadline || goal.status === 'completed' || goal.status === 'missed') return false;
    return isBefore(goal.deadline.toDate(), todayStart);
  });

  const activeGoals = displayedGoals.filter(goal => goal.status === 'in-progress' || (goal.status === 'pending' && !isBefore(goal.deadline?.toDate() || new Date(), todayStart)));

  const topPriorities = todayGoals.filter(g => g.priority === 'high' && g.status !== 'completed');

  const getGoalProgressScore = (goal: any) => {
    if (goal.status === 'completed') return 1;

    const subTasks = Array.isArray(goal.subTasks) ? goal.subTasks : [];
    if (subTasks.length > 0) {
      const completedSubTasks = subTasks.filter((st: any) => st.completed).length;
      return completedSubTasks / subTasks.length;
    }

    if (goal.progressType === 'percentage') {
      return Math.min(1, Math.max(0, Number(goal.completedValue || 0) / 100));
    }

    if (goal.progressType === 'duration') {
      const target = Number(goal.targetValue || goal.estimatedTime || 0);
      const actual = Number(goal.completedValue ?? goal.actualTime ?? 0);
      return target > 0 ? Math.min(1, Math.max(0, actual / target)) : 0;
    }

    return 0;
  };

  const completedTodayCount = todayGoals.reduce((acc, goal) => acc + getGoalProgressScore(goal), 0);
  const totalTodayCount = todayGoals.length;
  const progressPercent = totalTodayCount === 0 ? 0 : Math.round((completedTodayCount / totalTodayCount) * 100);
  const completedTodayLabel = Number.isInteger(completedTodayCount)
    ? completedTodayCount.toString()
    : completedTodayCount.toFixed(1);
  const completedNoDateCount = noDateGoals.reduce((acc, goal) => acc + getGoalProgressScore(goal), 0);
  const totalNoDateCount = noDateGoals.length;
  const noDateProgressPercent = totalNoDateCount === 0 ? 0 : Math.round((completedNoDateCount / totalNoDateCount) * 100);
  const completedNoDateLabel = Number.isInteger(completedNoDateCount)
    ? completedNoDateCount.toString()
    : completedNoDateCount.toFixed(1);

  const focusTimeToday = timerSessions.reduce((acc, session) => {
    const sessionDate = getFocusSessionDate(session);
    if (!sessionDate || !isToday(sessionDate)) return acc;
    return acc + getFocusSessionSeconds(session);
  }, 0);

  const getActiveTimerSeconds = () => {
    if (typeof window === 'undefined') return 0;

    try {
      const rawTimer = window.localStorage.getItem(FOCUS_TIMER_STORAGE_KEY);
      if (!rawTimer) return 0;

      const timer = JSON.parse(rawTimer);
      if (!timer || timer.timerState === 'idle' || timer.timerState === 'break') return 0;

      const startedAt = timer.startTime ? new Date(timer.startTime) : null;
      if (!startedAt || Number.isNaN(startedAt.getTime()) || !isToday(startedAt)) return 0;

      const secondsSinceSaved = timer.timerState === 'running'
        ? Math.max(0, Math.floor((focusClock.getTime() - Number(timer.savedAt || focusClock.getTime())) / 1000))
        : 0;
      const isStopwatch = timer.mode === 'free' || (timer.mode === 'goal' && timer.goalTimerStyle === 'free');

      if (isStopwatch) {
        return Math.max(0, Number(timer.elapsedTime || 0) + secondsSinceSaved);
      }

      const baseWorkedSeconds = Math.max(0, Number(timer.workDuration || 0) - Number(timer.timeLeft || 0));
      return Math.min(Number(timer.workDuration || baseWorkedSeconds), baseWorkedSeconds + secondsSinceSaved);
    } catch (error) {
      console.error('Could not read active focus timer', error);
      return 0;
    }
  };

  const totalFocusSecondsToday = focusTimeToday + getActiveTimerSeconds();
  const focusMinutesToday = roundFocusSecondsToMinutes(totalFocusSecondsToday);

  // Smart Insights Generation
  const generateInsights = () => {
    const insights = [];
    
    // Yesterday's completion
      const yesterdayGoals = displayedGoals.filter(g => g.deadline && isYesterday(g.deadline.toDate()));
    if (yesterdayGoals.length > 0) {
      const yesterdayCompleted = yesterdayGoals.filter(g => g.status === 'completed').length;
      const yesterdayPercent = Math.round((yesterdayCompleted / yesterdayGoals.length) * 100);
      if (yesterdayPercent >= 80) {
        insights.push({ icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-50', text: `Great job! You completed ${yesterdayPercent}% of your goals yesterday.` });
      } else if (yesterdayPercent < 50) {
        insights.push({ icon: Activity, color: 'text-orange-500', bg: 'bg-orange-50', text: `You completed ${yesterdayPercent}% yesterday. Let's aim higher today!` });
      }
    }

    // Best Subject/Category
    const completedGoals = displayedGoals.filter(g => g.status === 'completed');
    if (completedGoals.length > 0) {
      const categoryCounts = completedGoals.reduce((acc, g) => {
        if (g.categoryId) acc[g.categoryId] = (acc[g.categoryId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const bestCategoryId = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0];
      const bestCategory = categories.find(c => c.id === bestCategoryId);
      if (bestCategory) {
        insights.push({ icon: BrainCircuit, color: 'text-blue-500', bg: 'bg-blue-50', text: `Your most productive category is ${bestCategory.name}.` });
      }
    }

    // Behind in Subject/Category
    const missedOrOverdue = displayedGoals.filter(g => g.status === 'missed' || (g.status === 'pending' && g.deadline && isBefore(g.deadline.toDate(), todayStart)));
    if (missedOrOverdue.length > 0) {
      const categoryCounts = missedOrOverdue.reduce((acc, g) => {
        if (g.categoryId) acc[g.categoryId] = (acc[g.categoryId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const worstCategoryId = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0];
      const worstCategory = categories.find(c => c.id === worstCategoryId);
      if (worstCategory && categoryCounts[worstCategoryId] > 2) {
        insights.push({ icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', text: `You are falling behind in ${worstCategory.name}. Try to catch up!` });
      }
    }

    if (insights.length === 0) {
      insights.push({ icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50', text: "Keep adding goals to get personalized insights." });
    }

    return insights.slice(0, 2); // Show top 2 insights
  };

  const insights = generateInsights();

  // Weekly Consistency Snapshot
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weeklyConsistency = last7Days.map(day => {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const dayGoals = displayedGoals.filter(g => {
      const deadline = getGoalDate(g.deadline);
      const startDate = getGoalDate(g.startDate);
      return Boolean((deadline && deadline >= day && deadline < nextDay) || (startDate && startDate >= day && startDate < nextDay));
    });
    
    const completed = dayGoals.filter(g => g.status === 'completed').length;
    const total = dayGoals.length;
    return {
      date: day,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      hasGoals: total > 0
    };
  });

  // Greeting Logic
  const hour = new Date().getHours();
  let greeting = 'Good Evening';
  if (hour < 12) greeting = 'Good Morning';
  else if (hour < 18) greeting = 'Good Afternoon';

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } };

  if (loading) {
    return <div className="p-6 pb-32 animate-pulse space-y-6 dark:bg-gray-950">
      <div className="h-20 bg-gray-100 dark:bg-slate-800 rounded-2xl"></div>
      <div className="h-40 bg-gray-100 dark:bg-slate-800 rounded-3xl"></div>
      <div className="h-32 bg-gray-100 dark:bg-slate-800 rounded-2xl"></div>
    </div>;
  }

  return (
    <div className="p-6 md:p-8 lg:p-10 pb-32 relative min-h-screen text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        {/* 1. Header & Greeting */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 pt-2 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start"
        >
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{greeting},</p>
            <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">
              {profile?.displayName?.split(' ')[0] || 'there'}
            </h1>
          </div>
          <div className="flex flex-col items-start gap-3 text-left sm:items-end sm:text-right">
            <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-gray-200 dark:border-white/10 shadow-sm dark:shadow-[0_0_15px_rgba(249,115,22,0.15)] transition-colors duration-300">
              <Flame className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{profile?.currentStreak || 0} Day Streak</span>
            </div>
            <InstallShravionButton className="rounded-2xl px-4 py-2 text-xs" />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* 2. Smart Insights */}
            {insights.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {insights.map((insight, idx) => {
                  const Icon = insight.icon;
                  // Handle dark classes internally based on colors
                  const darkBg = insight.bg === 'bg-green-50' ? 'dark:bg-emerald-500/10 dark:border-emerald-500/20' : 
                                 insight.bg === 'bg-orange-50' ? 'dark:bg-orange-500/10 dark:border-orange-500/20' :
                                 insight.bg === 'bg-blue-50' ? 'dark:bg-blue-500/10 dark:border-blue-500/20' :
                                 insight.bg === 'bg-red-50' ? 'dark:bg-rose-500/10 dark:border-rose-500/20' :
                                 insight.bg === 'bg-amber-50' ? 'dark:bg-amber-500/10 dark:border-amber-500/20' : '';
                  const darkSvg = insight.color === 'text-green-500' ? 'dark:text-emerald-400' :
                                  insight.color === 'text-orange-500' ? 'dark:text-orange-400' :
                                  insight.color === 'text-blue-500' ? 'dark:text-blue-400' :
                                  insight.color === 'text-red-500' ? 'dark:text-rose-400' :
                                  insight.color === 'text-amber-500' ? 'dark:text-amber-400' : '';

                  return (
                    <div key={idx} className={cn("bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] dark:shadow-none flex items-center gap-4 transition-colors duration-300")}>
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-transparent", insight.bg, darkBg)}>
                        <Icon className={cn("w-5 h-5", insight.color, darkSvg)} />
                      </div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{insight.text}</p>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* 3. Control Center Grid */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 md:grid-cols-3 gap-4"
            >
              {/* Today's Progress */}
              <div className="col-span-2 bg-[#0A0A0A] dark:bg-slate-900/80 rounded-[2rem] p-6 text-white shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.1)] dark:border dark:border-white/10 relative overflow-hidden transition-colors duration-300">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 dark:bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                <div className="relative z-10 flex justify-between items-end mb-4">
                  <div>
                    <p className="text-white/60 dark:text-gray-400 font-medium mb-1 text-xs uppercase tracking-wider">Today's Progress</p>
                    <h2 className="text-4xl font-display font-light tracking-tighter dark:text-white">{progressPercent}%</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-white/50 dark:text-gray-500 font-medium text-sm">{completedTodayLabel} / {totalTodayCount} tasks</p>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-white/10 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                    className="h-full bg-white dark:bg-blue-500 rounded-full relative overflow-hidden dark:shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                  </motion.div>
                </div>
              </div>

              {/* Focus Time */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex flex-col justify-between transition-colors duration-300">
                <div className="w-8 h-8 bg-purple-50 dark:bg-purple-500/10 rounded-full flex items-center justify-center border border-transparent dark:border-purple-500/20 mb-3">
                  <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">{focusMinutesToday} <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">min</span></p>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mt-1">Focus Time Today</p>
                </div>
              </div>

              {/* Active Goals */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex flex-col justify-between transition-colors duration-300">
                <div className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center border border-transparent dark:border-blue-500/20 mb-3">
                  <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">{activeGoals.length}</p>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mt-1">Active Goals</p>
                </div>
              </div>
            </motion.div>

            {/* 5. Today's Tasks List */}
            <div>
              <div className="flex justify-between items-end mb-5">
                <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white tracking-tight">Today's Tasks</h2>
                <Link to="/goals" className="text-sm font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 flex items-center transition-colors">
                  See all <ChevronRight className="w-4 h-4 ml-0.5" />
                </Link>
              </div>

              {todayGoals.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-10 bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300"
                >
                  <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ListTodo className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  </div>
                  <h3 className="text-gray-900 dark:text-white font-bold text-lg mb-1">No tasks for today</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Take a break or plan ahead.</p>
                  <Link to="/goals" className="inline-flex items-center justify-center px-6 py-3 bg-gray-900 dark:bg-blue-600 text-white font-bold rounded-xl hover:bg-black dark:hover:bg-blue-500 shadow-lg shadow-gray-900/20 dark:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-colors">
                    Add Goal
                  </Link>
                </motion.div>
              ) : (
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
                  {todayGoals.map(goal => {
                    const category = categories.find(c => c.id === goal.categoryId);
                    const isOverdue = goal.status === 'pending' && goal.deadline && goal.deadline.toDate() < new Date(new Date().setHours(0,0,0,0));
                    const isPriority = goal.priority === 'high' && goal.status !== 'completed';

                    return (
                      <motion.div 
                        variants={item}
                        key={goal.id} 
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 relative overflow-visible",
                          goal.status === 'completed' 
                            ? "bg-gray-50/50 dark:bg-slate-900/50 border-transparent opacity-60" 
                            : cn(
                                "bg-white dark:bg-slate-900 shadow-sm hover:shadow-md dark:shadow-none hover:dark:border-white/10",
                                isOverdue ? "bg-red-50/50 dark:bg-red-900/10 border-l-[6px] border-l-red-500 border-red-100 dark:border-red-900/40" : "border-gray-100 dark:border-white/5",
                                isPriority ? "ring-2 ring-red-400 dark:ring-red-500 shadow-[0_0_15px_-3px_rgba(239,68,68,0.5)] dark:shadow-[0_0_20px_-3px_rgba(239,68,68,0.4)] z-10" : ""
                              )
                        )}
                      >
                          <button 
                            onClick={() => toggleGoalStatus(goal.id, goal.status, goal.subTasks, goal.progressType, goal.targetValue, goal.type)}
                            className="shrink-0 transition-transform active:scale-75"
                          >
                          {goal.status === 'completed' ? (
                            <CheckCircle2 className="w-7 h-7 text-gray-900 dark:text-slate-700 dark:fill-slate-900" />
                          ) : goal.status === 'missed' ? (
                            <div className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center border border-red-100 dark:border-red-500/20">
                              <div className="w-3 h-3 bg-red-500 dark:bg-red-400 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                            </div>
                          ) : goal.status === 'in-progress' ? (
                            <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
                              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                          ) : (
                            <Circle className="w-7 h-7 text-gray-200 dark:text-slate-700 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className={cn(
                            "font-medium text-[16px] truncate transition-colors",
                            goal.status === 'completed' ? "text-gray-400 dark:text-slate-500 line-through" : 
                            goal.status === 'missed' ? "text-red-500 dark:text-red-400" : "text-gray-900 dark:text-gray-200"
                          )}>
                            {goal.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            {category && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-transparent dark:border-white/5">
                                {category.name}
                              </span>
                            )}
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-transparent",
                              goal.priority === 'high' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20" :
                              goal.priority === 'medium' ? "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20" :
                              "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                            )}>
                              {goal.priority}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-transparent",
                              goal.status === 'completed' ? "bg-green-50 text-green-600 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" :
                              goal.status === 'missed' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20" :
                              goal.status === 'in-progress' ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20" :
                              "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300 dark:border-white/5"
                            )}>
                              {getStatusLabel(goal.status)}
                            </span>
                          </div>
                        </div>
                        {goal.progressType === 'duration' && goal.status !== 'completed' && (
                          <Link
                            to="/focus"
                            state={{ goalId: goal.id, mode: 'goal' }}
                            className="shrink-0 flex items-center justify-center p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                          >
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </Link>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </div>

            {/* No Date Goals */}
            {noDateGoals.length > 0 && (
              <div>
                <div className="flex justify-between items-end mb-5">
                  <div>
                    <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white tracking-tight">No Date Goals</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{totalNoDateCount} goals without start or end date</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">{noDateProgressPercent}%</p>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">{completedNoDateLabel} / {totalNoDateCount} done</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden transition-colors duration-300">
                  <div className="p-5 border-b border-gray-100 dark:border-white/5">
                    <div className="h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${noDateProgressPercent}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-white/5">
                    {noDateGoals.map(goal => {
                      const category = categories.find(c => c.id === goal.categoryId);
                      return (
                        <div key={goal.id} className="flex items-center gap-4 p-4">
                          <button
                            onClick={() => toggleGoalStatus(goal.id, goal.status, goal.subTasks, goal.progressType, goal.targetValue, goal.type)}
                            className="shrink-0 transition-transform active:scale-75"
                          >
                            {goal.status === 'completed' ? (
                              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-emerald-400 fill-green-50 dark:fill-emerald-500/10" />
                            ) : goal.status === 'in-progress' ? (
                              <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center border border-blue-100 dark:border-blue-500/20">
                                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              </div>
                            ) : (
                              <Circle className="w-7 h-7 text-gray-200 dark:text-slate-700 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <h4 className={cn(
                              "font-medium text-[16px] truncate transition-colors",
                              goal.status === 'completed' ? "text-gray-400 dark:text-slate-500 line-through" : "text-gray-900 dark:text-gray-200"
                            )}>
                              {goal.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {category && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400">
                                  {category.name}
                                </span>
                              )}
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                                goal.status === 'completed' ? "bg-green-50 text-green-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                                goal.status === 'in-progress' ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
                                "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300"
                              )}>
                                {getStatusLabel(goal.status)}
                              </span>
                            </div>
                          </div>

                          {goal.status !== 'completed' && (
                            <Link
                              to="/focus"
                              state={{ goalId: goal.id, mode: 'goal' }}
                              className="shrink-0 flex items-center justify-center p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                            >
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {/* Weekly Consistency */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
              <div className="flex justify-between items-end mb-6">
                <p className="text-xs uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">Weekly Consistency</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{Math.round(weeklyConsistency.reduce((acc, d) => acc + d.percent, 0) / 7)}% avg</p>
              </div>
              <div className="flex justify-between items-end h-24 gap-2">
                {weeklyConsistency.map((day, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1">
                    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-full relative overflow-hidden flex items-end">
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${day.percent}%` }}
                        transition={{ duration: 1, delay: 0.1 * i }}
                        className={cn(
                          "w-full rounded-full",
                          day.percent >= 80 ? "bg-green-500 dark:bg-emerald-500 dark:shadow-[0_0_10px_rgba(16,185,129,0.5)]" : 
                          day.percent >= 50 ? "bg-amber-400 dark:bg-amber-500 dark:shadow-[0_0_10px_rgba(245,158,11,0.5)]" : 
                          day.hasGoals ? "bg-red-400 dark:bg-rose-500 dark:shadow-[0_0_10px_rgba(244,63,94,0.5)]" : 
                          "bg-gray-300 dark:bg-slate-700"
                        )}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{format(day.date, 'EEEE').charAt(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Overdue & Priorities */}
            {(overdueGoals.length > 0 || topPriorities.length > 0) && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4"
              >
                {overdueGoals.length > 0 && (
                  <div className="bg-red-50 dark:bg-rose-500/10 border border-red-100 dark:border-rose-500/20 rounded-2xl p-5 transition-colors duration-300">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-rose-400" />
                      <h3 className="text-sm font-bold text-red-900 dark:text-rose-100 uppercase tracking-wider">Overdue ({overdueGoals.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {overdueGoals.slice(0, 3).map(goal => (
                        <div key={goal.id} className="flex items-center justify-between bg-white/60 dark:bg-slate-900/60 border border-transparent dark:border-white/5 p-3 rounded-xl transition-colors">
                          <span className="text-sm font-medium text-red-900 dark:text-rose-200 truncate pr-4">{goal.title}</span>
                          <span className="text-xs font-bold text-red-500 dark:text-rose-400 shrink-0">{format(goal.deadline.toDate(), 'MMM d')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {topPriorities.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 rounded-2xl p-5 transition-colors duration-300">
                    <div className="flex items-center gap-2 mb-4">
                      <Flame className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <h3 className="text-sm font-bold text-orange-900 dark:text-orange-100 uppercase tracking-wider">Top Priorities Today</h3>
                    </div>
                    <div className="space-y-2">
                      {topPriorities.slice(0, 3).map(goal => (
                        <div key={goal.id} className="flex items-center justify-between bg-white/60 dark:bg-slate-900/60 border border-transparent dark:border-white/5 p-3 rounded-xl transition-colors">
                          <span className="text-sm font-medium text-orange-900 dark:text-orange-200 truncate pr-4">{goal.title}</span>
                          <button onClick={() => toggleGoalStatus(goal.id, goal.status, goal.subTasks, goal.progressType, goal.targetValue, goal.type)} className="shrink-0">
                            <Circle className="w-5 h-5 text-orange-300 dark:text-orange-500/50 hover:text-orange-500 dark:hover:text-orange-400 transition-colors" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <Link to="/goals" className="fixed bottom-24 md:bottom-8 right-6 md:right-8 z-40 lg:hidden">
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-[0_8px_30px_rgba(37,99,235,0.3)] dark:shadow-[0_0_20px_rgba(59,130,246,0.4)] flex items-center justify-center hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </motion.div>
      </Link>
    </div>
  );
};
