import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { logout, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  LogOut, User as UserIcon, Settings, Bell, Clock, 
  Moon, Sun, Monitor, Shield, ChevronRight, Zap, 
  Target, Award, Flame, CheckCircle2, Timer, Sparkles, Save, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { getFocusSessionSeconds, roundFocusSecondsToMinutes } from '../lib/focus-session-cache';
import {
  ADMIN_EMAIL,
  DEFAULT_REVIEW_SUGGESTIONS,
  normalizeReviewSuggestions,
  readLocalReviewSuggestions,
  saveLocalReviewSuggestions
} from '../lib/review-suggestions';

export const Profile = () => {
  const { profile, user, updateUserProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [completedGoals, setCompletedGoals] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(0);
  const [notifications, setNotifications] = useState(true);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [todaySuggestion, setTodaySuggestion] = useState('');
  const [weeklySuggestionsText, setWeeklySuggestionsText] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    setEditDisplayName(profile?.displayName || '');
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        const goalsQuery = query(collection(db, 'goals'), where('uid', '==', user.uid), where('status', '==', 'completed'));
        const goalsSnap = await getDocs(goalsQuery);
        setCompletedGoals(goalsSnap.size);

        const sessionsQuery = query(collection(db, 'pomodoroSessions'), where('uid', '==', user.uid));
        const sessionsSnap = await getDocs(sessionsQuery);
        let totalMins = 0;
        sessionsSnap.forEach(doc => {
          const data = doc.data();
          if (!data.isTimeBlock) {
             totalMins += roundFocusSecondsToMinutes(getFocusSessionSeconds(data));
          }
        });
        setFocusMinutes(totalMins);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadReviewSuggestions = async () => {
      const localSettings = readLocalReviewSuggestions();
      setTodaySuggestion(localSettings.todaySuggestion);
      setWeeklySuggestionsText(localSettings.weeklySuggestions.join('\n'));

      try {
        const snap = await getDoc(doc(db, 'reviewSettings', 'global'));
        const settings = snap.exists() ? normalizeReviewSuggestions(snap.data()) : DEFAULT_REVIEW_SUGGESTIONS;
        setTodaySuggestion(settings.todaySuggestion);
        setWeeklySuggestionsText(settings.weeklySuggestions.join('\n'));
        saveLocalReviewSuggestions(settings);
      } catch (error) {
        console.error('Could not load admin review suggestions', error);
      }
    };

    loadReviewSuggestions();
  }, [isAdmin]);

  const handleSaveAdminSuggestions = async () => {
    if (!isAdmin || !user) return;

    const settings = normalizeReviewSuggestions({
      todaySuggestion,
      weeklySuggestions: weeklySuggestionsText.split('\n')
    });

    setAdminSaving(true);
    setAdminMessage('');
    saveLocalReviewSuggestions(settings);

    try {
      await setDoc(doc(db, 'reviewSettings', 'global'), {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email
      }, { merge: true });
      setAdminMessage('Suggestions saved.');
    } catch (error) {
      console.error('Could not save admin review suggestions', error);
      setAdminMessage('Saved locally. Firestore permission needs update.');
    } finally {
      setAdminSaving(false);
    }
  };

  const openEditProfile = () => {
    setEditDisplayName(profile?.displayName || '');
    setProfileMessage('');
    setShowEditProfile(true);
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editDisplayName.trim()) {
      setProfileMessage('Name is required.');
      return;
    }

    setProfileSaving(true);
    setProfileMessage('');

    try {
      await updateUserProfile({
        displayName: editDisplayName
      });
      setProfileMessage('Profile updated.');
      window.setTimeout(() => {
        setShowEditProfile(false);
        setProfileMessage('');
      }, 500);
    } catch (error) {
      console.error('Could not update profile', error);
      setProfileMessage('Could not update profile. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const focusHours = Math.floor(focusMinutes / 60);

  return (
    <div className="p-6 md:p-8 lg:p-10 pb-32 max-w-4xl mx-auto">
      <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-white tracking-tight mb-8 pt-4">Settings & Profile</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile Card & Stats */}
        <div className="lg:col-span-1 space-y-6">
          {/* Profile Identity */}
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none text-center relative overflow-hidden transition-colors duration-300">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 dark:from-blue-500/10 dark:to-indigo-600/10"></div>
            
            <div className="relative w-28 h-28 mx-auto mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full animate-spin-slow opacity-20 blur-md"></div>
              <div className="relative w-full h-full bg-white dark:bg-slate-800 rounded-full flex items-center justify-center overflow-hidden ring-4 ring-white dark:ring-slate-900 shadow-xl transition-colors duration-300">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 bg-gradient-to-br from-amber-400 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-white dark:border-slate-900 flex items-center gap-1 transition-colors">
                <Zap className="w-3 h-3" />
                Lvl {profile?.level || 1}
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{profile?.displayName}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{profile?.email}</p>
            
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 flex justify-between items-center transition-colors duration-300 border border-transparent dark:border-white/5">
              <div className="text-left">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Total XP</p>
                <p className="text-xl font-display font-bold text-gray-900 dark:text-white">{profile?.xp || 0}</p>
              </div>
              <div className="w-px h-10 bg-gray-200 dark:bg-white/10"></div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Streak</p>
                <div className="flex items-center gap-1 justify-end">
                  <Flame className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                  <p className="text-xl font-display font-bold text-gray-900 dark:text-white">{profile?.currentStreak || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-5 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
              <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3 transition-colors">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">{completedGoals}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Goals Met</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-5 border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mb-3 transition-colors">
                <Timer className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">{focusHours}<span className="text-base text-gray-500 dark:text-gray-400 font-normal ml-1">hrs</span></p>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Focus Time</p>
            </div>
          </div>
        </div>

        {/* Right Column: Settings */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Preferences */}
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden transition-colors duration-300">
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-slate-800/30">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                App Preferences
              </h3>
            </div>
            
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {/* Theme */}
              <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Appearance</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred theme</p>
                </div>
                <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto border border-transparent dark:border-white/10 transition-colors">
                  {(['light', 'dark', 'system'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        "flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all flex items-center justify-center gap-2",
                        theme === t 
                          ? "bg-white dark:bg-blue-600/20 text-gray-900 dark:text-blue-400 shadow-sm dark:shadow-none" 
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      )}
                    >
                      {t === 'light' && <Sun className="w-4 h-4" />}
                      {t === 'dark' && <Moon className="w-4 h-4" />}
                      {t === 'system' && <Monitor className="w-4 h-4" />}
                      <span className="sm:hidden">{t}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notifications */}
              <div className="p-6 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Notifications</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Reminders and timer alerts</p>
                </div>
                <button 
                  onClick={() => setNotifications(!notifications)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative border border-transparent",
                    notifications ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-200 dark:bg-slate-700 dark:border-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    notifications ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden transition-colors duration-300">
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-slate-800/30">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                Account
              </h3>
            </div>
            
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              <button
                onClick={openEditProfile}
                className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
              >
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Edit Profile</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Update your display name</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
              </button>
              <Link
                to="/home"
                className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
              >
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">View Website</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Open the public ShravionOS homepage</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
              </Link>
            </div>
          </div>

          {isAdmin && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-blue-100 dark:border-blue-500/10 shadow-sm dark:shadow-none overflow-hidden transition-colors duration-300">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-blue-50/70 dark:bg-blue-500/10">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Admin Panel
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Edit review panel suggestions</p>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Today Suggestion
                  </label>
                  <textarea
                    value={todaySuggestion}
                    onChange={(e) => setTodaySuggestion(e.target.value)}
                    rows={3}
                    placeholder="Write today's suggestion..."
                    className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    Smart Suggestions for Next Week
                  </label>
                  <textarea
                    value={weeklySuggestionsText}
                    onChange={(e) => setWeeklySuggestionsText(e.target.value)}
                    rows={5}
                    placeholder="Write one suggestion per line..."
                    className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Each line becomes one suggestion card in Reviews.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveAdminSuggestions}
                    disabled={adminSaving}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {adminSaving ? 'Saving...' : 'Save Suggestions'}
                  </button>
                  {adminMessage && <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{adminMessage}</p>}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => logout()}
            className="w-full bg-red-50 dark:bg-rose-500/10 text-red-600 dark:text-rose-400 rounded-2xl py-4 font-bold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-rose-500/20 transition-colors active:scale-[0.98] border border-transparent dark:border-rose-500/10"
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </button>

        </div>
      </div>

      <AnimatePresence>
        {showEditProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xl"
            onClick={() => !profileSaving && setShowEditProfile(false)}
          >
            <motion.form
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleSaveProfile}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 p-6 dark:border-white/5 dark:bg-slate-800/40">
                <div>
                  <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white">Edit Profile</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Update the name shown across your account</p>
                </div>
                <button
                  type="button"
                  onClick={() => !profileSaving && setShowEditProfile(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 transition-colors hover:text-gray-900 dark:bg-slate-700 dark:text-gray-300 dark:hover:text-white"
                  aria-label="Close edit profile"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-slate-800/40">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-2 ring-white dark:bg-slate-700 dark:ring-slate-900">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <UserIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{editDisplayName.trim() || 'Your name'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.email}</p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">Display Name</label>
                  <input
                    value={editDisplayName}
                    onChange={(event) => setEditDisplayName(event.target.value)}
                    placeholder="Enter your name"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-white dark:placeholder-gray-500"
                  />
                </div>

                {profileMessage && (
                  <p className={cn(
                    "text-sm font-medium",
                    profileMessage.includes('updated') ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  )}>
                    {profileMessage}
                  </p>
                )}
              </div>

              <div className="flex gap-3 border-t border-gray-100 bg-gray-50/70 p-6 dark:border-white/5 dark:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => !profileSaving && setShowEditProfile(false)}
                  className="flex-1 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
