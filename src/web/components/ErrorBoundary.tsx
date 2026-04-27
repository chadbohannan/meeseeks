import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-red-400">
          <h1 className="text-xl mb-2">Something went wrong</h1>
          <pre className="text-sm whitespace-pre-wrap">{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
