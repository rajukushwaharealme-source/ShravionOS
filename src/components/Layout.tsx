import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Navigation } from './Navigation';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export const Layout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ redirectTo: location.pathname }} replace />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-gradient-to-br dark:from-[#0B1220] dark:to-[#111827] dark:text-slate-50 font-sans flex overflow-hidden transition-colors duration-300 selection:bg-blue-500/30 selection:text-blue-200">
      <Navigation />
      <main className="flex-1 relative h-screen overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto w-full pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="min-h-screen"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
