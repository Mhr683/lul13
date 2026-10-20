import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';

type AuthMode = 'LOGIN' | 'SIGNUP' | 'FORGOT';

interface AuthPanelProps {
  title?: string;
  subtitle?: string;
  allowSignup?: boolean;
  onSuccess?: () => void;
}

// Login / sign-up / forgot-password form used by the storefront account modal and the admin gate
export const AuthPanel: React.FC<AuthPanelProps> = ({ title, subtitle, allowSignup = true, onSuccess }) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useStore();
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'SIGNUP') {
      if (name.trim().length < 2) return setError('Please enter your full name.');
      if (password.length < 8) return setError('Password kam az kam 8 characters ka rakhein.');
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return setError('The password must contain both letters and numbers.');
      }
      if (password !== confirmPassword) return setError('The two passwords do not match.');
    }

    setBusy(true);
    const result =
      mode === 'LOGIN'
        ? await signInWithEmail(email, password)
        : mode === 'SIGNUP'
        ? await signUpWithEmail(name, email, password)
        : await resetPassword(email);
    setBusy(false);

    if (!result.ok) {
      setError(result.message || 'Something went wrong. Please try again.');
      return;
    }
    if (mode === 'FORGOT') {
      setInfo(result.message || 'A reset link has been sent.');
      return;
    }
    if (result.message) setInfo(result.message);
    onSuccess?.();
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    const result = await signInWithGoogle();
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Google sign-in failed.');
      return;
    }
    onSuccess?.();
  };

  const inputClass =
    'w-full px-3 py-2.5 bg-white border border-black/20 text-sm text-[#141413] focus:border-black focus:outline-none';

  return (
    <div className="w-full max-w-sm space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-display text-[#141413]">
          {title ||
            (mode === 'SIGNUP' ? 'Create account' : mode === 'FORGOT' ? 'Password reset' : 'Sign in')}
        </h2>
        {subtitle && <p className="text-xs text-[#575653]">{subtitle}</p>}
      </div>

      {mode !== 'FORGOT' && (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-black/25 bg-white text-sm font-semibold text-[#141413] hover:bg-black/[0.03] cursor-pointer disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {mode === 'SIGNUP' ? 'Sign up' : 'Sign in'} with Google
          </button>
          <div className="flex items-center gap-3 text-[11px] text-[#787774]">
            <span className="flex-1 h-px bg-black/10" />
            ya email se
            <span className="flex-1 h-px bg-black/10" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'SIGNUP' && (
          <div>
            <label className="block text-xs text-[#575653] mb-1" htmlFor="auth-name">
              Poora naam
            </label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-[#575653] mb-1" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        {mode !== 'FORGOT' && (
          <div>
            <label className="block text-xs text-[#575653] mb-1" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'SIGNUP' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        )}
        {mode === 'SIGNUP' && (
          <div>
            <label className="block text-xs text-[#575653] mb-1" htmlFor="auth-password2">
              Confirm password
            </label>
            <input
              id="auth-password2"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        )}

        {error && (
          <div role="alert" className="p-2.5 text-xs bg-rose-50 border border-rose-300 text-rose-800">
            {error}
          </div>
        )}
        {info && <div className="p-2.5 text-xs bg-emerald-50 border border-emerald-300 text-emerald-800">{info}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full px-4 py-2.5 bg-[#141413] text-white text-sm font-semibold hover:bg-black cursor-pointer disabled:opacity-60"
        >
          {busy
            ? 'Please wait...'
            : mode === 'LOGIN'
            ? 'Login'
            : mode === 'SIGNUP'
            ? 'Create account'
            : 'Send reset link'}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {mode === 'LOGIN' ? (
          <>
            <button type="button" onClick={() => switchMode('FORGOT')} className="text-[#575653] underline cursor-pointer">
              Password bhool gaye?
            </button>
            {allowSignup && (
              <button type="button" onClick={() => switchMode('SIGNUP')} className="font-semibold underline cursor-pointer">
                Create a new account
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={() => switchMode('LOGIN')} className="font-semibold underline cursor-pointer">
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
};

// Full-screen modal wrapper for the storefront
export const AuthModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative bg-[#FBFBF9] border border-black/15 p-6 sm:p-8 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 px-2 text-lg text-[#575653] hover:text-[#141413] cursor-pointer"
        >
          ×
        </button>
        <AuthPanel subtitle="Sign in to see your order history and tracking. You do not need to sign in to place an order." onSuccess={onClose} />
      </div>
    </div>
  );
};
