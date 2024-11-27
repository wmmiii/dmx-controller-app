import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      error: undefined,
    };
  }

  static getDerivedStateFromError(error: unknown) {
    // Update state so the next render will show the fallback UI.
    return { error };
  }

  componentDidCatch(error: unknown, _errorInfo: unknown) {
    console.error('ErrorBoundary caught error', error);
    this.setState({
      error,
    });
  }

  render() {
    if (this.state.error) {
      // You can render any custom fallback UI
      return (
        <div>
          <h1>Something went wrong.</h1>
          <p>{String(this.state.error)}</p>
        </div>
      );
    }

    return this.props.children; 
  }
}
