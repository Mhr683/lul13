import React from 'react';

// Safety net: a bug in one screen shows a short "try again" message instead of a blank white page,
// and the rest of the app (header, cart, orders) keeps working. After a new version is published, an
// old page may ask for a file that no longer exists; that case reloads the page once by itself.

const RELOAD_KEY = 'eb_reloaded_at';

function isStaleChunk(err: unknown) {
  const m = String((err as any)?.message || err || '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|Loading chunk|ChunkLoadError/i.test(m);
}

interface Props {
  children: React.ReactNode;
  /** Small inline message (inside a page) instead of the full-screen one */
  inline?: boolean;
  label?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info?.componentStack);
    if (isStaleChunk(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* storage blocked: the message below has a reload button */
      }
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.inline) {
      return (
        <div className="p-4 my-3 bg-amber-50 border border-amber-300 text-amber-950 text-sm space-y-2">
          <p className="font-semibold">This part could not be shown.</p>
          <div className="flex gap-2">
            <button type="button" onClick={this.retry} className="px-3 py-1.5 bg-[#141413] text-white text-xs font-semibold cursor-pointer">
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="px-3 py-1.5 border border-black/30 text-xs font-semibold cursor-pointer">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBFBF9] p-6">
        <div className="max-w-sm w-full bg-white border border-black/10 p-6 text-center space-y-4">
          <p className="text-lg font-semibold text-[#141413]">Something went wrong on this page</p>
          <p className="text-sm text-[#575653]">Please try again. Your cart and orders are safe.</p>
          <div className="flex gap-2 justify-center">
            <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 bg-[#1a7f4b] text-white text-sm font-semibold rounded cursor-pointer">
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                this.retry();
                window.location.href = '/';
              }}
              className="px-4 py-2 border border-black/20 text-sm font-semibold rounded cursor-pointer"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
