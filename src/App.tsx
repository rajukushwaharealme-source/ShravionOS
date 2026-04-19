/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Navigate, useRoutes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Goals } from './pages/Goals';
import { Analytics } from './pages/Analytics';
import { Reviews } from './pages/Reviews';
import { CalendarView } from './pages/CalendarView';
import { Profile } from './pages/Profile';
import { Organization } from './pages/Organization';
import { Focus } from './pages/Focus';
import { LandingPage } from './pages/LandingPage';
import { LegalPage } from './pages/LegalPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PWAInstallProvider } from './components/PWAInstallPrompt';
import { useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const protectedRoutes = [
  { path: 'app', element: <Dashboard /> },
  { path: 'goals', element: <Goals /> },
  { path: 'focus', element: <Focus /> },
  { path: 'calendar', element: <CalendarView /> },
  { path: 'analytics', element: <Analytics /> },
  { path: 'reviews', element: <Reviews /> },
  { path: 'profile', element: <Profile /> },
  { path: 'organization', element: <Organization /> }
];

const PublicEntry = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-white">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return user ? <Navigate to="/app" replace /> : <LandingPage />;
};

const privacyPolicyContent = [
  'We may collect basic information such as your name, email address, profile details, and productivity data that you choose to store inside the app, including goals, focus sessions, calendar entries, analytics, and reviews.',
  'This information is used only to provide and improve the service, personalize your experience, and maintain app functionality. We do not sell your personal data to third parties.',
  'Your data is stored securely using trusted infrastructure and authentication systems. While we take reasonable steps to protect your information, no online service can guarantee absolute security.',
  'You are responsible for keeping your login credentials safe. If you believe your account has been compromised, please contact us immediately.',
  'ShravionOS may update this Privacy Policy from time to time. Continued use of the service after changes means you accept the updated policy.',
  'If you have questions about this Privacy Policy, you can contact us at shravion1@gmail.com.'
];

const termsContent = [
  'ShravionOS is a productivity platform designed to help users manage goals, focus sessions, planning, analytics, and reviews. You agree not to misuse the service, attempt unauthorized access, disrupt functionality, or use the platform for unlawful purposes.',
  'You are responsible for the accuracy of the information you enter and for maintaining the security of your account.',
  'We may update, improve, suspend, or modify parts of the service at any time without prior notice. We are not liable for temporary downtime, technical issues, or loss caused by misuse of the platform.',
  'All branding, design, content, and software elements of ShravionOS remain the property of the platform owner unless otherwise stated.',
  'By continuing to use ShravionOS, you accept these Terms & Conditions. If you do not agree, please do not use the service.',
  'For questions, contact shravion1@gmail.com.'
];

const disclaimerContent = [
  'The app is intended to help users track goals, manage focus sessions, review progress, and improve consistency. It does not provide medical, legal, financial, psychological, or professional advice.',
  'We do our best to keep the platform accurate, reliable, and available, but we do not guarantee uninterrupted service, complete accuracy, or error-free operation at all times.',
  'Any decisions made based on information, analytics, or planning tools within the app are the sole responsibility of the user.',
  'By using ShravionOS, you acknowledge that the service is provided on an "as is" and "as available" basis.',
  'For support or questions, contact shravion1@gmail.com.'
];

const AppRoutes = () =>
  useRoutes([
    { path: '/', element: <PublicEntry /> },
    { path: '/home', element: <LandingPage /> },
    { path: '/login', element: <Login /> },
    {
      path: '/privacy-policy',
      element: (
        <LegalPage
          title="Privacy Policy"
          intro="At ShravionOS, we value your privacy and are committed to protecting your personal information."
          paragraphs={privacyPolicyContent}
        />
      )
    },
    {
      path: '/terms-and-conditions',
      element: (
        <LegalPage
          title="Terms & Conditions"
          intro="Welcome to ShravionOS. By using this website and app, you agree to use the service responsibly and in accordance with these terms."
          paragraphs={termsContent}
        />
      )
    },
    {
      path: '/disclaimer',
      element: (
        <LegalPage
          title="Disclaimer"
          intro="ShravionOS is provided for personal productivity, planning, and organizational purposes only."
          paragraphs={disclaimerContent}
        />
      )
    },
    { element: <Layout />, children: protectedRoutes },
    { path: '*', element: <Navigate to="/" replace /> }
  ]);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <PWAInstallProvider>
            <Router>
              <AppRoutes />
            </Router>
          </PWAInstallProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
