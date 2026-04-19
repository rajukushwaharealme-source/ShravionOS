import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  Target, CheckCircle2, AlertCircle, TrendingUp, Clock, Calendar as CalendarIcon, 
  Flame, Activity, Filter, ChevronDown
} from 'lucide-react';
import { 
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
  isWithinInterval, format, eachDayOfInterval, subDays, isSameDay, differenceInDays
} from 'date-fns';
import { cn } from '../lib/utils';
import { withGoalDisplayStatus } from '../lib/goal-status';
import { FOCUS_SESSIONS_UPDATED_EVENT, getFocusSessionDate, getFocusSessionSeconds, mergeFocusSessionsWithCache, roundFocusSecondsToMinutes } from '../lib/focus-session-cache';

type TimeFilter = 'today' | 'week' | 'month' | 'all';

export const Analytics = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [statusClock, setStatusClock] = useState(new Date());
  const [timerSessions, setTimerSessions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  useEffect(() => {
    const intervalId = window.setInterval(() => setStatusClock(new Date()), 60000);
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

    const unsubCategories = onSnapshot(query(collection(db, 'categories'), where('uid', '==', user.uid)), (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
      setSubjects(cats.flatMap((c: any) => (c.subjects || []).map((s: any) => ({ ...s, categoryId: c.id }))));
      setConcepts(cats.flatMap((c: any) => (c.concepts || []).map((co: any) => ({ ...co, categoryId: c.id }))));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    const unsubGoals = onSnapshot(query(collection(db, 'goals'), where('uid', '==', user.uid)), (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    const unsubTimer = onSnapshot(query(collection(db, 'pomodoroSessions'), where('uid', '==', user.uid)), (snapshot) => {
      const allSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTimerSessions(mergeFocusSessionsWithCache(allSessions.filter((s: any) => !s.isTimeBlock)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pomodoroSessions'));

    return () => {
      unsubCategories();
      unsubGoals();
      unsubTimer();
    };
  }, [user]);

  const displayedGoals = useMemo(() => {
    return goals.map(goal => withGoalDisplayStatus(goal, statusClock));
  }, [goals, statusClock]);

  // Derived Data
  const { filteredGoals, filteredSessions, dateRange } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);

    if (timeFilter === 'today') {
      start = startOfDay(now);
    } else if (timeFilter === 'week') {
      start = startOfWeek(now, { weekStartsOn: 1 });
    } else if (timeFilter === 'month') {
      start = startOfMonth(now);
    } else {
      start = new Date(2000, 0, 1); // effectively 'all'
    }

    let fGoals = displayedGoals.filter(g => {
      const gDate = g.createdAt?.toDate() || new Date();
      return isWithinInterval(gDate, { start, end });
    });

    let fSessions = timerSessions.filter(s => {
      const sDate = getFocusSessionDate(s) || new Date();
      return isWithinInterval(sDate, { start, end });
    });

    if (categoryFilter !== 'all') {
      fGoals = fGoals.filter(g => g.categoryId === categoryFilter);
      fSessions = fSessions.filter(s => s.categoryId === categoryFilter);
    }

    if (subjectFilter !== 'all') {
      fGoals = fGoals.filter(g => g.subjectId === subjectFilter);
      // Timer sessions might not have subjectId directly, but we can filter if they do, or skip.
    }

    return { filteredGoals: fGoals, filteredSessions: fSessions, dateRange: { start, end } };
  }, [displayedGoals, timerSessions, timeFilter, categoryFilter, subjectFilter]);

  // Metrics
  const totalGoals = filteredGoals.length;
  const completedGoals = filteredGoals.filter(g => g.status === 'completed').length;
  const missedGoals = filteredGoals.filter(g => g.status === 'missed').length;
  const pendingGoals = filteredGoals.filter(g => g.status === 'pending' || g.status === 'in-progress').length;
  const completionRate = totalGoals === 0 ? 0 : Math.round((completedGoals / totalGoals) * 100);

  const totalFocusSeconds = filteredSessions.reduce((acc, s) => acc + getFocusSessionSeconds(s), 0);
  const totalFocusHours = (totalFocusSeconds / 3600).toFixed(1);
  
  const daysInPeriod = timeFilter === 'today' ? 1 : timeFilter === 'week' ? 7 : timeFilter === 'month' ? 30 : Math.max(1, differenceInDays(new Date(), dateRange.start));
  const avgDailyFocusMinutes = Math.round((totalFocusSeconds / 60) / daysInPeriod);

  // Calculate Streak & Consistency
  const { streak, consistencyScore } = useMemo(() => {
    if (timerSessions.length === 0 && displayedGoals.length === 0) return { streak: 0, consistencyScore: 0 };
    
    const activeDays = new Set<string>();
    timerSessions.forEach(s => {
      const sessionDate = getFocusSessionDate(s);
      if (sessionDate) activeDays.add(format(sessionDate, 'yyyy-MM-dd'));
    });
    displayedGoals.filter(g => g.status === 'completed').forEach(g => {
      if (g.completedAt) activeDays.add(format(g.completedAt.toDate(), 'yyyy-MM-dd'));
    });

    let currentStreak = 0;
    let checkDate = new Date();
    while (true) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      if (activeDays.has(dateStr)) {
        currentStreak++;
        checkDate = subDays(checkDate, 1);
      } else if (isSameDay(checkDate, new Date())) {
        // It's okay if today is not active yet, check yesterday
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }
    }

    // Consistency over the selected period
    let activeDaysInPeriod = 0;
    if (timeFilter !== 'all') {
      const days = eachDayOfInterval({ start: dateRange.start, end: new Date() });
      days.forEach(d => {
        if (activeDays.has(format(d, 'yyyy-MM-dd'))) activeDaysInPeriod++;
      });
      const consistency = Math.round((activeDaysInPeriod / Math.max(1, days.length)) * 100);
      return { streak: currentStreak, consistencyScore: consistency };
    }
    
    return { streak: currentStreak, consistencyScore: 0 };
  }, [timerSessions, displayedGoals, timeFilter, dateRange]);

  // Charts Data
  const trendData = useMemo(() => {
    if (timeFilter === 'today' || timeFilter === 'all') return [];
    const days = eachDayOfInterval({ start: dateRange.start, end: new Date() });
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayGoals = filteredGoals.filter(g => g.completedAt && format(g.completedAt.toDate(), 'yyyy-MM-dd') === dayStr);
      const daySessions = filteredSessions.filter(s => {
        const sessionDate = getFocusSessionDate(s);
        return sessionDate && format(sessionDate, 'yyyy-MM-dd') === dayStr;
      });
      
      return {
        date: format(day, 'MMM dd'),
        completed: dayGoals.length,
        focusMinutes: roundFocusSecondsToMinutes(daySessions.reduce((acc, s) => acc + getFocusSessionSeconds(s), 0))
      };
    });
  }, [filteredGoals, filteredSessions, dateRange, timeFilter]);

  const categoryData = useMemo(() => {
    return categories.map(cat => {
      const catGoals = filteredGoals.filter(g => g.categoryId === cat.id);
      const completed = catGoals.filter(g => g.status === 'completed').length;
      return {
        name: cat.name,
        value: catGoals.length,
        completed,
        successRate: catGoals.length ? Math.round((completed / catGoals.length) * 100) : 0,
        color: cat.color || '#3B82F6'
      };
    }).filter(d => d.value > 0);
  }, [categories, filteredGoals]);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  if (loading) {
    return (
      <div className="p-6 pb-32 flex items-center justify-center min-h-screen dark:bg-slate-950 transition-colors duration-300">
        <div className="animate-pulse flex flex-col items-center">
          <Activity className="w-8 h-8 text-blue-500 mb-4 animate-bounce" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Crunching your numbers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-10 pb-32 max-w-7xl mx-auto min-h-screen transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight">Insights</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Track your productivity and consistency</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
              className="appearance-none bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 text-sm rounded-xl pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500/50 outline-none shadow-sm dark:shadow-none font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 text-sm rounded-xl pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500/50 outline-none shadow-sm dark:shadow-none font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>
      
      {/* Top Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none relative overflow-hidden group hover:shadow-md dark:hover:shadow-none transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5 group-hover:opacity-20 dark:group-hover:opacity-10 transition-opacity">
            <Target className="w-16 h-16 md:w-20 md:h-20 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="relative z-10">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Completion Rate</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl md:text-4xl font-display font-bold text-gray-900 dark:text-white">{completionRate}%</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="text-green-600 dark:text-emerald-400 bg-green-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full transition-colors">{completedGoals} done</span>
              <span>of {totalGoals}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none relative overflow-hidden group hover:shadow-md dark:hover:shadow-none transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5 group-hover:opacity-20 dark:group-hover:opacity-10 transition-opacity">
            <Clock className="w-16 h-16 md:w-20 md:h-20 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="relative z-10">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Focus Time</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl md:text-4xl font-display font-bold text-gray-900 dark:text-white">{totalFocusHours}h</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full transition-colors">{avgDailyFocusMinutes}m / day</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none relative overflow-hidden group hover:shadow-md dark:hover:shadow-none transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5 group-hover:opacity-20 dark:group-hover:opacity-10 transition-opacity">
            <Flame className="w-16 h-16 md:w-20 md:h-20 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="relative z-10">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Current Streak</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl md:text-4xl font-display font-bold text-gray-900 dark:text-white">{streak}</p>
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">days</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full transition-colors">Keep it up!</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none relative overflow-hidden group hover:shadow-md dark:hover:shadow-none transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5 group-hover:opacity-20 dark:group-hover:opacity-10 transition-opacity">
            <Activity className="w-16 h-16 md:w-20 md:h-20 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="relative z-10">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">Consistency</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl md:text-4xl font-display font-bold text-gray-900 dark:text-white">{consistencyScore}%</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full transition-colors">Active days</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Trend Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Activity Trend</h2>
            <div className="flex items-center gap-3 text-xs font-medium">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-gray-600 dark:text-gray-400">Tasks</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><span className="text-gray-600 dark:text-gray-400">Focus (m)</span></div>
            </div>
          </div>
          <div className="h-64 md:h-80 w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" strokeOpacity={0.2} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f8fafc' }}
                    cursor={{ stroke: '#4b5563', strokeWidth: 2, strokeDasharray: '4 4' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="completed" name="Completed Tasks" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorCompleted)" />
                  <Area yAxisId="right" type="monotone" dataKey="focusMinutes" name="Focus Minutes" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorFocus)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                Not enough data for trend chart
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Category Distribution</h2>
          <div className="h-64 md:h-80 w-full flex items-center">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full text-center text-gray-400 dark:text-gray-500 text-sm">
                No category data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Success Rate & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Success Rate by Category */}
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none lg:col-span-2 transition-colors duration-300">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Success Rate by Category</h2>
          <div className="h-64 md:h-80 w-full">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" strokeOpacity={0.2} />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} width={100} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f8fafc' }}
                    formatter={(value: number) => [`${value}%`, 'Success Rate']}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Bar dataKey="successRate" radius={[0, 4, 4, 0]} barSize={24}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                No data to display
              </div>
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none flex flex-col transition-colors duration-300">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Task Status</h2>
          <div className="flex-1 flex flex-col justify-center gap-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-white/5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Pending</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">To be done</p>
                </div>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">{pendingGoals}</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-green-50 dark:bg-emerald-500/10 border border-green-100 dark:border-emerald-500/10 transition-colors hover:bg-green-100 dark:hover:bg-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Completed</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Successfully finished</p>
                </div>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">{completedGoals}</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-red-50 dark:bg-rose-500/10 border border-red-100 dark:border-rose-500/10 transition-colors hover:bg-red-100 dark:hover:bg-rose-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-rose-500/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Missed</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Needs attention</p>
                </div>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">{missedGoals}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
