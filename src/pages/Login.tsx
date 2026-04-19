import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loginWithGoogle } from '../lib/firebase';
import { AlertTriangle, BarChart3, CalendarDays, Loader2, ShieldCheck, Target } from 'lucide-react';
import { BrandText } from '../components/BrandText';

export const Login = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const redirectTo = typeof location.state?.redirectTo === 'string' && location.state.redirectTo.startsWith('/')
    ? location.state.redirectTo
    : '/app';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030712] text-white transition-colors duration-300">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      await loginWithGoogle();
    } catch (error: any) {
      console.error(error);
      setIsLoggingIn(false);

      if (error?.code === 'auth/unauthorized-domain') {
        setErrorMsg('unauthorized-domain');
      } else {
        setErrorMsg(error?.message || 'An error occurred during login.');
      }
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#030712] px-5 py-8 text-white antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(37,99,235,0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.12),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.04),#030712_84%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="ShravionOS home">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.35)] ring-1 ring-blue-300/20">
              <img src="/android-chrome-192x192.png" alt="ShravionOS" className="h-full w-full object-cover" />
            </div>
            <BrandText className="text-xl" />
          </Link>
          <Link to="/" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white">
            View Website
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_0.9fr]">
          <section className="hidden lg:block">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
              <ShieldCheck className="h-4 w-4 text-blue-300" />
              Private, focused, and built for consistency
            </div>
            <h1 className="max-w-2xl font-display text-6xl font-bold leading-[1.02] tracking-tight">
              Sign in and continue building momentum.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Your goals, focus sessions, calendar plans, analytics, and reviews stay connected in one personal workspace.
            </p>

            <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
              {[
                { icon: Target, title: 'Goals', body: 'Plan outcomes and subtasks.' },
                { icon: CalendarDays, title: 'Planning', body: 'Organize today and later.' },
                { icon: BarChart3, title: 'Insights', body: 'Review progress clearly.' }
              ].map(item => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_30px_120px_rgba(2,8,23,0.75)] backdrop-blur md:p-8">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl shadow-[0_0_45px_rgba(37,99,235,0.45)] ring-1 ring-blue-300/20">
                  <img src="/android-chrome-192x192.png" alt="ShravionOS" className="h-full w-full object-cover" />
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-white">
                  Welcome to ShravionOS
                </h1>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
                  Continue with Google to open your private goals, focus timer, planning, and insights workspace.
                </p>
              </div>

              {errorMsg === 'unauthorized-domain' && (
                <div className="mb-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-left">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-rose-400" />
                    <div>
                      <h3 className="mb-1 font-bold text-rose-300">Action Required</h3>
                      <p className="mb-3 text-sm text-rose-200/80">
                        Google Login is blocked because this app&apos;s URL is not authorized in your Firebase Console.
                      </p>
                      <div className="rounded-lg border border-rose-500/10 bg-slate-900/50 p-3">
                        <p className="mb-1 text-xs font-semibold text-slate-300">1. Go to Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains</p>
                        <p className="mb-1 text-xs font-semibold text-slate-300">2. Click &quot;Add domain&quot; and paste:</p>
                        <code className="block select-all break-all rounded border border-white/5 bg-slate-800 p-2 text-[10px] text-slate-300">
                          {window.location.hostname}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && errorMsg !== 'unauthorized-domain' && (
                <div className="mb-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-[0_0_0_1px_rgba(147,197,253,0.25),0_18px_55px_rgba(37,99,235,0.45)] transition-all hover:-translate-y-0.5 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoggingIn ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              <p className="mt-5 text-center text-xs leading-5 text-slate-500">
                By continuing, you open the private ShravionOS workspace connected to your account.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
