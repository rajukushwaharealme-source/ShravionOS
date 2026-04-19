import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Target, BarChart2, Calendar, User, Clock, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { BrandText } from './BrandText';

export const Navigation = () => {
  const location = useLocation();
  const navItems = [
    { to: '/app', icon: Home, label: 'Home' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/focus', icon: Clock, label: 'Focus' },
    { to: '/calendar', icon: Calendar, label: 'Calendar' },
    { to: '/analytics', icon: BarChart2, label: 'Stats' },
    { to: '/reviews', icon: Sparkles, label: 'Reviews' },
    { to: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-white/5 h-screen sticky top-0 z-40 transition-colors duration-300">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-blue-600/20 ring-1 ring-blue-300/20">
            <img src="/android-chrome-192x192.png" alt="ShravionOS" className="w-full h-full object-cover" />
          </div>
          <BrandText className="text-xl" />
        </div>
        
        <div className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                  isActive 
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-600/10 font-medium dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" 
                    : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 dark:bg-blue-500 rounded-r-full dark:shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <item.icon 
                  className={cn(
                    "w-5 h-5 transition-transform duration-200",
                    isActive ? "scale-110" : "group-hover:scale-110"
                  )} 
                  strokeWidth={isActive ? 2.5 : 2} 
                />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] rounded-full p-1.5 z-50">
        <div className="flex justify-between items-center relative px-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-col items-center justify-center w-12 h-12 rounded-full transition-colors duration-500 z-10",
                  isActive ? "text-white" : "text-gray-400 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 bg-gray-900 dark:bg-blue-600 rounded-full -z-10 dark:shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon 
                  className={cn(
                    "w-5 h-5 transition-all duration-500",
                    isActive ? "scale-100" : "scale-95"
                  )} 
                  strokeWidth={isActive ? 2 : 1.5} 
                />
              </NavLink>
            );
          })}
        </div>
      </div>
    </>
  );
};
