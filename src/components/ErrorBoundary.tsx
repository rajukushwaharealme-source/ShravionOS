import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message.startsWith('{')) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = parsed.error;
          }
        } else {
          errorMessage = this.state.error?.message || errorMessage;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h1>
            <p className="text-gray-500 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white rounded-2xl py-4 font-semibold hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
