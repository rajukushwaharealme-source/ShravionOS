import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { BrandText } from '../components/BrandText';

type LegalPageProps = {
  title: string;
  intro: string;
  paragraphs: string[];
};

export const LegalPage = ({ title, intro, paragraphs }: LegalPageProps) => {
  useEffect(() => {
    document.title = `${title} | ShravionOS`;
  }, [title]);

  return (
    <div className="min-h-screen bg-[#030712] text-white antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_8%,rgba(37,99,235,0.20),transparent_32%),radial-gradient(circle_at_80%_14%,rgba(139,92,246,0.16),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.04),#030712_82%)]" />

      <header className="relative border-b border-white/10 bg-[#030712]/82 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="ShravionOS home">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.35)] ring-1 ring-blue-300/20">
              <img src="/android-chrome-192x192.png" alt="ShravionOS" className="h-full w-full object-cover" />
            </div>
            <BrandText className="text-xl" />
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </nav>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <section className="mb-10 max-w-3xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">Legal</p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-base leading-7 text-slate-300 md:text-lg md:leading-8">{intro}</p>
        </section>

        <article className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-6 shadow-[0_30px_120px_rgba(2,8,23,0.55)] backdrop-blur md:p-8">
          <div className="space-y-6 text-sm leading-7 text-slate-300 md:text-base md:leading-8">
            {paragraphs.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-10 rounded-3xl border border-blue-400/20 bg-blue-500/10 p-5">
            <h2 className="font-display text-xl font-bold text-white">Contact</h2>
            <a href="mailto:shravion1@gmail.com" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-200 hover:text-white">
              <Mail className="h-4 w-4" />
              shravion1@gmail.com
            </a>
          </div>
        </article>
      </main>
    </div>
  );
};

