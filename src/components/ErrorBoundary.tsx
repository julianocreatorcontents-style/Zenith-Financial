import React, { Component } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Algo deu errado</h1>
            <p className="text-[var(--text-muted)] text-sm">Ocorreu um erro inesperado. Por favor, tente recarregar a página.</p>
            <pre className="bg-[var(--bg-card)] p-4 rounded-xl text-xs text-[var(--trend-down)] overflow-auto max-h-40 text-left border border-[var(--border-card)]">
              {this.state.errorInfo}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl font-bold text-sm"
            >
              Recarregar App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
