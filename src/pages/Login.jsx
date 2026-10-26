import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import {
  loginUser,
  getCurrentUser,
  hasPathPermission,
} from '../utils/userManagementStorage';

const Login = () => {
  const navigate = useNavigate();

  // Form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status & feedback state
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // If already authenticated, redirect immediately
  useEffect(() => {
    const existing = getCurrentUser();
    if (existing) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  // Form submission handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    const errors = {};

    const cleanId = identifier.trim();
    if (!cleanId) {
      errors.identifier = 'Username or phone number is required';
    }
    if (!password) {
      errors.password = 'Password is required';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsLoading(true);

    try {
      // Authenticate via MotoLend authentication engine
      const user = await loginUser(cleanId, password);

      // Determine appropriate landing route based on role & permissions
      if (user.role === 'Admin') {
        navigate('/dashboard', { replace: true });
      } else {
        // Enforce staff member's permissions
        if (hasPathPermission(user, '/dashboard')) {
          navigate('/dashboard', { replace: true });
        } else if (hasPathPermission(user, '/collection')) {
          navigate('/collection', { replace: true });
        } else if (hasPathPermission(user, '/loans')) {
          navigate('/loans', { replace: true });
        } else {
          navigate('/customers', { replace: true });
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900/95 font-sans relative overflow-hidden py-10 px-4 sm:px-6 lg:px-8">
      {/* Background ambient light effects matching MotoLend theme */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#006B52]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#39D6A3]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
          
          {/* Top Brand Banner Header */}
          <div className="bg-[#003C32] px-7 py-8 text-center relative border-b border-[#145247]">
            <div className="flex items-center justify-center gap-3 mb-3">
              <img
                src="/Motolend_logo.png"
                alt="MotoLend Logo"
                className="h-10 w-10 rounded-xl object-contain bg-white/10 p-1 border border-white/20 shadow-xs"
              />
              <div className="text-2xl font-black tracking-tight text-white flex items-center">
                <span>Moto</span>
                <span className="text-[#39D6A3]">Lend</span>
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Welcome to MotoLend
            </h1>
            <p className="text-xs sm:text-sm text-[#A8D5C8] font-medium mt-1">
              Sign in to manage your finance operations.
            </p>
          </div>

          {/* Form Container */}
          <div className="p-6 sm:p-8 space-y-5">
            {/* Error Message Notification */}
            {errorMessage && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold animate-in fade-in duration-200">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4.5" noValidate>
              
              {/* Username / Phone Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Username or Mobile Number
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="username-field"
                    type="text"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (fieldErrors.identifier) {
                        setFieldErrors({ ...fieldErrors, identifier: null });
                      }
                    }}
                    disabled={isLoading}
                    placeholder="e.g. admin or 9876543210"
                    autoComplete="username"
                    className={`w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm bg-slate-50 border rounded-xl outline-none transition-all placeholder:text-slate-400 ${
                      fieldErrors.identifier
                        ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-slate-200 focus:border-[#006B52] focus:bg-white focus:ring-2 focus:ring-[#006B52]/20'
                    }`}
                  />
                </div>
                {fieldErrors.identifier && (
                  <p className="text-[11px] font-semibold text-rose-600 mt-1">
                    {fieldErrors.identifier}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="password-field"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors({ ...fieldErrors, password: null });
                      }
                    }}
                    disabled={isLoading}
                    placeholder="Enter account password"
                    autoComplete="current-password"
                    className={`w-full pl-10 pr-11 py-2.5 sm:py-3 text-sm bg-slate-50 border rounded-xl outline-none transition-all placeholder:text-slate-400 ${
                      fieldErrors.password
                        ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20'
                        : 'border-slate-200 focus:border-[#006B52] focus:bg-white focus:ring-2 focus:ring-[#006B52]/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer rounded transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] font-semibold text-rose-600 mt-1">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                id="login-submit-button"
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-[#006B52] hover:bg-[#005344] active:scale-[0.99] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            {/* Security Badge */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-[11px] font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Enterprise Grade 256-bit Security • RBAC Enabled</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-400 mt-6 font-medium">
          &copy; {new Date().getFullYear()} MotoLend Auto Finance System. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
