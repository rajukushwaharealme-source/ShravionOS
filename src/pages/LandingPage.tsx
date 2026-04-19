import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Github,
  Instagram,
  Layers3,
  LineChart,
  Mail,
  Menu,
  Play,
  Sparkles,
  Target,
  TimerReset,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BrandText } from '../components/BrandText';
import { InstallShravionButton, LandingInstallMessage } from '../components/PWAInstallPrompt';

const features = [
  {
    icon: Target,
    title: 'Goal Tracking',
    description: 'Turn big outcomes into clear goals, subtasks, priorities, and progress you can trust.'
  },
  {
    icon: Clock3,
    title: 'Focus Timer',
    description: 'Start timed or open-ended focus sessions and connect every productive minute to the right work.'
  },
  {
    icon: CalendarDays,
    title: 'Calendar Planning',
    description: 'Plan today, upcoming deadlines, and flexible goals without mixing everything into one crowded list.'
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Understand focus time, completion trends, consistency, and weekly patterns at a glance.'
  },
  {
    icon: Sparkles,
    title: 'Reviews & Insights',
    description: 'Review what worked, spot what slipped, and make your next week easier to execute.'
  }
];

const steps = [
  ['01', 'Create goals', 'Define what matters and break it into subtasks you can actually finish.'],
  ['02', 'Start a focus session', 'Choose the goal or subtask you want to work on and begin with one click.'],
  ['03', 'Track progress', 'Focus time, completed subtasks, and daily progress stay connected as you work.'],
  ['04', 'Review insights', 'Use simple reviews and weekly patterns to plan your next move with confidence.']
];

const previews = [
  { title: 'Dashboard', metric: '82%', label: 'Today progress', accent: 'from-blue-500 to-cyan-400' },
  { title: 'Goals', metric: '12', label: 'Active goals', accent: 'from-emerald-500 to-teal-300' },
  { title: 'Focus', metric: '25:00', label: 'Deep work session', accent: 'from-violet-500 to-fuchsia-400' },
  { title: 'Calendar', metric: '7', label: 'Planned blocks', accent: 'from-orange-500 to-amber-300' },
  { title: 'Analytics', metric: '14h', label: 'Weekly focus', accent: 'from-indigo-500 to-blue-300' }
];

const trustSignals = [
  {
    icon: Layers3,
    title: 'Built for study and work',
    description: 'Manage academic goals, professional priorities, creative projects, and personal routines in one calm workspace.'
  },
  {
    icon: CheckCircle2,
    title: 'Private and personal',
    description: 'Your goals, sessions, plans, analytics, and reviews are tied to your own account and built around your workflow.'
  },
  {
    icon: LineChart,
    title: 'Progress without guesswork',
    description: 'Separate scheduled tasks, flexible goals, subtasks, focus minutes, and reviews so progress stays easy to understand.'
  },
  {
    icon: Sparkles,
    title: 'Smart planning in one place',
    description: 'Goal tracking, focus sessions, planning, analytics, and weekly reviews work together as one reliable system.'
  }
];

const seoFaqs = [
  {
    question: 'What is ShravionOS?',
    answer: 'ShravionOS is a modern productivity app for goal tracking, focus sessions, calendar planning, analytics, and reviews. It helps you turn intentions into visible progress.'
  },
  {
    question: 'Who can use this app?',
    answer: 'ShravionOS is built for students, professionals, creators, freelancers, and self-improvement users who want a clean system for planning, deep work, and consistency.'
  },
  {
    question: 'How does goal tracking work?',
    answer: 'Create goals, add subtasks, set priorities, choose progress types, add optional dates, and mark work complete. Scheduled goals and flexible goals stay organized separately.'
  },
  {
    question: 'How does the focus timer work?',
    answer: 'The focus timer supports both timed sessions and free focus sessions. Connect a session to a full goal or a specific subtask, and ShravionOS records the work.'
  },
  {
    question: 'Can I track study and work both?',
    answer: 'Yes. Track study goals, work projects, creative tasks, fitness routines, or personal habits with the same goal, focus, planning, and review workflow.'
  },
  {
    question: 'Is my data private and secure?',
    answer: 'ShravionOS uses authenticated accounts and keeps your productivity data connected to your own profile. Your goals, sessions, and reviews are designed to stay private to your account.'
  },
  {
    question: 'Is the app free to use?',
    answer: 'You can start using ShravionOS through a simple app flow without a complicated setup. Advanced plans can be introduced later as the product grows.'
  },
  {
    question: 'How do analytics and reviews work?',
    answer: 'ShravionOS turns completed goals, focus minutes, calendar activity, and progress history into clear analytics and review insights for better daily and weekly planning.'
  },
  {
    question: 'Do I need to install anything?',
    answer: 'No. ShravionOS runs in the browser, so you can open the website, sign in, and start managing goals, focus sessions, planning, and reviews.'
  }
];

export const LandingPage = () => {
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const appHref = user ? '/app' : '/login';
  const getStartedState = user ? undefined : { redirectTo: '/app' };

  useEffect(() => {
    document.title = 'ShravionOS | Productivity App, Goal Tracker & Planner';

    const metaDescription = 'ShravionOS is a productivity app with a goal tracker, focus timer, study planner, task management, analytics, and daily planning tools for focused work.';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', metaDescription);
  }, []);

  const navLinks = [
    ['Features', '#features'],
    ['How It Works', '#how-it-works'],
    ['FAQ', '#faq'],
    ['Contact', '#contact']
  ];

  return (
    <div className="min-h-screen scroll-smooth bg-[#030712] text-white antialiased selection:bg-blue-500/30 selection:text-blue-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#030712]/82 shadow-[0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8" aria-label="Main navigation">
          <Link to={user ? '/home' : '/'} className="flex items-center gap-3" aria-label="ShravionOS home">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.35)] ring-1 ring-blue-300/20">
              <img src="/android-chrome-192x192.png" alt="ShravionOS" className="h-full w-full object-cover" />
            </div>
            <BrandText className="text-xl" />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} className="text-sm font-medium text-slate-300 transition-colors hover:text-white">
                {label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to={appHref}
              state={getStartedState}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_0_1px_rgba(147,197,253,0.25),0_14px_42px_rgba(37,99,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-blue-500"
            >
              Get Started
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white md:hidden"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#030712]/95 px-5 py-4 shadow-2xl backdrop-blur-2xl md:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">
                  {label}
                </a>
              ))}
              <Link to={appHref} state={getStartedState} className="mt-2 rounded-full bg-blue-600 px-5 py-3 text-center text-sm font-bold text-white shadow-[0_18px_50px_rgba(37,99,235,0.35)]">
                Get Started
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.24),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(14,165,233,0.16),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.04),#030712_86%)]" />
          <div className="absolute left-1/2 top-24 h-px w-[min(900px,80vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 md:gap-14 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[0.98fr_1.02fr] lg:items-center lg:pb-28 lg:pt-28">
            <div>
              <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-100 shadow-[0_0_30px_rgba(37,99,235,0.15)] sm:text-sm">
                <Sparkles className="h-4 w-4 shrink-0 text-blue-300" />
                <span className="truncate">Goals, focus, planning, and consistency in one system</span>
              </div>
              <h1 className="max-w-4xl font-display text-4xl font-bold leading-[1.02] tracking-tight text-white sm:text-5xl md:text-7xl">
                Your smart productivity system for goals, focus, and consistency.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg md:text-xl md:leading-8">
                Plan meaningful goals, start focused work sessions, track real progress, and review your patterns in one clean workspace built for everyday momentum.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to={appHref}
                  state={getStartedState}
                  className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-blue-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_0_1px_rgba(147,197,253,0.28),0_18px_60px_rgba(37,99,235,0.55)] transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_0_0_1px_rgba(191,219,254,0.5),0_24px_80px_rgba(37,99,235,0.7)] sm:w-auto"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                  <span className="relative">Get Started</span>
                  <ArrowRight className="relative h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <a
                  href="#preview"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-7 py-4 text-base font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10 sm:w-auto"
                >
                  <Play className="h-5 w-5 fill-current" />
                  See Demo
                </a>
                <InstallShravionButton className="w-full justify-center border-white/12 bg-white/[0.06] px-7 py-4 text-base shadow-none backdrop-blur hover:bg-white/10 sm:w-auto" />
              </div>
              <LandingInstallMessage />

              <div className="mt-6 flex flex-col gap-3 text-sm leading-6 text-slate-400 sm:flex-row sm:items-center">
                <p className="font-medium">Built for students, professionals, creators, and self-improvement users.</p>
                <div className="hidden h-1 w-1 rounded-full bg-slate-600 sm:block" />
                <p className="font-medium text-slate-300">Private planning, focused execution, and clear insights.</p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-blue-500/10 blur-3xl" />
              <div className="relative rounded-[2rem] border border-white/12 bg-slate-950/75 p-3 shadow-[0_30px_140px_rgba(2,8,23,0.88)] backdrop-blur">
                <div className="rounded-[1.5rem] border border-white/10 bg-[#08111f] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Live Dashboard</p>
                      <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">Today's Productivity Hub</h2>
                    </div>
                    <div className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">5 day streak</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2 rounded-3xl bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-5 ring-1 ring-white/10">
                      <div className="mb-5 flex items-end justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Goal progress</p>
                          <p className="mt-2 font-display text-5xl font-bold">84%</p>
                        </div>
                        <p className="text-sm text-slate-400">11 / 13 actions</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-[84%] rounded-full bg-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.9)]" />
                      </div>
                    </div>
                    <div className="rounded-3xl bg-gradient-to-br from-violet-500/12 to-white/[0.03] p-5 ring-1 ring-white/10">
                      <TimerReset className="mb-5 h-8 w-8 text-violet-300" />
                      <p className="font-display text-3xl font-bold">2h 15m</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">Focus today</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Next session</p>
                      <p className="mt-2 font-display text-2xl font-bold">25:00</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Weekly review</p>
                      <p className="mt-2 font-display text-2xl font-bold">Ready</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {['Complete math revision', 'Ship portfolio update', 'Plan next week'].map((task, index) => (
                      <div key={task} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                        <CheckCircle2 className={cn('h-5 w-5', index === 0 ? 'text-emerald-400' : 'text-slate-600')} />
                        <span className="flex-1 text-sm font-medium text-slate-200">{task}</span>
                        <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                          {index === 0 ? 'Done' : 'Focus'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="mb-12 max-w-3xl">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">Features</p>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Everything you need to plan, focus, and improve.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {features.map(feature => (
              <article key={feature.title} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition-all hover:-translate-y-1 hover:border-blue-400/30 hover:bg-white/[0.06]">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20 transition-colors group-hover:bg-blue-500/20">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl font-bold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
            <div className="mb-12 grid gap-6 md:grid-cols-[0.85fr_1fr] md:items-end">
              <div>
                <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">How It Works</p>
                <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">A simple workflow for consistent progress.</h2>
              </div>
              <p className="text-base leading-7 text-slate-400 md:text-lg md:leading-8">ShravionOS helps you decide what matters, protect time for it, measure your effort, and improve with useful reviews.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([number, title, description]) => (
                <article key={number} className="rounded-3xl border border-white/10 bg-[#07111f] p-6">
                  <p className="font-display text-3xl font-bold text-blue-300">{number}</p>
                  <h3 className="mt-8 font-display text-xl font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="preview" className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">App Preview</p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">A focused view for every part of your day.</h2>
            </div>
            <Link to={appHref} state={getStartedState} className="inline-flex items-center gap-2 self-start rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/10 md:self-auto">
              Open ShravionOS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {previews.map(preview => (
              <article key={preview.title} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950">
                <div className={cn('h-2 bg-gradient-to-r', preview.accent)} />
                <div className="p-5">
                  <div className="mb-8 flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold">{preview.title}</h3>
                    <div className="h-8 w-8 rounded-xl bg-white/5 ring-1 ring-white/10" />
                  </div>
                  <p className="font-display text-4xl font-bold">{preview.metric}</p>
                  <p className="mt-2 text-sm text-slate-400">{preview.label}</p>
                  <div className="mt-6 space-y-2">
                    <div className="h-2 w-full rounded-full bg-white/8" />
                    <div className="h-2 w-2/3 rounded-full bg-white/8" />
                    <div className="h-2 w-4/5 rounded-full bg-white/8" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="trust-heading" className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
            <div className="mb-12 grid gap-6 md:grid-cols-[0.85fr_1fr] md:items-end">
              <div>
                <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">Trust Signals</p>
                <h2 id="trust-heading" className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                  Built to make productivity feel clear, private, and sustainable.
                </h2>
              </div>
              <p className="text-base leading-7 text-slate-400 md:text-lg md:leading-8">
                ShravionOS brings goal tracking, focus sessions, calendar planning, analytics, and review insights into a private workspace that supports real daily consistency.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trustSignals.map(signal => (
                <article key={signal.title} className="rounded-3xl border border-white/10 bg-[#07111f] p-6">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
                    <signal.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold">{signal.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{signal.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 md:grid-cols-[0.8fr_1.2fr] md:px-8">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">FAQ</p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Questions before you start?</h2>
              <p className="mt-5 text-base leading-7 text-slate-400 md:text-lg md:leading-8">Clear answers about goal tracking, focus sessions, productivity planning, privacy, analytics, and reviews.</p>
            </div>
            <div className="space-y-3">
              {seoFaqs.map((faq, index) => (
                <article key={faq.question} className="rounded-2xl border border-white/10 bg-[#07111f]" itemScope itemType="https://schema.org/Question">
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.025]"
                    aria-expanded={openFaq === index}
                  >
                    <span className="font-display text-base font-bold sm:text-lg" itemProp="name">{faq.question}</span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-slate-400 transition-transform', openFaq === index && 'rotate-180')} />
                  </button>
                  {openFaq === index && (
                    <div className="px-5 pb-5 text-sm leading-7 text-slate-300/85" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                      <p itemProp="text">{faq.answer}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-blue-300/20">
                <img src="/android-chrome-192x192.png" alt="ShravionOS" className="h-full w-full object-cover" />
              </div>
              <BrandText className="text-xl" />
            </div>
            <p className="max-w-sm text-sm leading-7 text-slate-400">
              ShravionOS is a modern productivity app for goal tracking, focus sessions, calendar planning, analytics, and weekly reviews.
            </p>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Navigation</h3>
            <div className="space-y-3 text-sm text-slate-400">
              {navLinks.map(([label, href]) => <a key={href} href={href} className="block hover:text-white">{label}</a>)}
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Legal</h3>
            <div className="space-y-3 text-sm text-slate-400">
              <Link to="/privacy-policy" className="block hover:text-white">Privacy Policy</Link>
              <Link to="/terms-and-conditions" className="block hover:text-white">Terms & Conditions</Link>
              <Link to="/disclaimer" className="block hover:text-white">Disclaimer</Link>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-300">Contact</h3>
            <a href="mailto:shravion1@gmail.com" className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <Mail className="h-4 w-4" />
              shravion1@gmail.com
            </a>
            <div className="flex gap-2">
              <a href="#" aria-label="GitHub" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">
                <Github className="h-4 w-4" />
              </a>
              <a href="#" aria-label="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 pt-8 text-sm text-slate-500 md:flex-row">
          <p>Copyright {new Date().getFullYear()} ShravionOS. All rights reserved.</p>
          <p>Plan clearly. Focus deeply. Improve consistently.</p>
        </div>
      </footer>
    </div>
  );
};
