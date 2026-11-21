import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed.error) {
          friendly = `${parsed.error} (${parsed.operationType || 'read'} on ${parsed.path || 'database'})`;
        }
      } catch {
        // Keep plain message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] dark:bg-[#18191A] p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] p-6 shadow-sm text-center">
            <h2 className="font-display text-xl font-bold text-[#050505] dark:text-[#E4E6EB]">
              Connection or Permission Notice
            </h2>
            <p className="mt-2 text-sm text-[#65676B] dark:text-[#B0B3B8] break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2.5 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Reload VartaPress
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
