import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Landmark,
  Headphones,
  Info,
  X,
} from 'lucide-react';
import {
  loginUser,
  getCurrentUser,
  hasPathPermission,
} from '../utils/userManagementStorage';

const Login = () => {
  const navigate = useNavigate();

  // Form inputs state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Feedback & status state
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // If already authenticated, redirect immediately to dashboard
  useEffect(() => {
    const existing = getCurrentUser();
    if (existing) {
      navigate('/dashboard', { replace: true });
    }

    // Retrieve remembered username if previously stored
    const remembered = localStorage.getItem('motoLend_remembered_username');
    if (remembered) {
      setIdentifier(remembered);
      setRememberMe(true);
    }
  }, [navigate]);

  // Form submission handler (exact preservation of authentication flow)
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');
    const errors = {};

    const cleanId = identifier.trim();
    if (!cleanId) {
      errors.identifier = 'Username or mobile number is required';
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
      // Remember me preference handling
      if (rememberMe) {
        localStorage.setItem('motoLend_remembered_username', cleanId);
      } else {
        localStorage.removeItem('motoLend_remembered_username');
      }

      // Authenticate via existing MotoLend authentication engine
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

  const handleForgotPassword = () => {
    setInfoMessage('To reset your password, contact your system administrator at admin@motolend.com or call +91 98765 43210.');
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-gradient-to-br from-[#d4f6e8] via-[#e2f8ee] to-[#f4faf7] relative font-sans overflow-x-hidden p-4 sm:p-6 lg:p-8 selection:bg-emerald-500/20 selection:text-emerald-800">
      
      {/* Scoped CSS Animations for Subtle Moving-Light and Floating Effects */}
      <style>{`
        @keyframes gentleFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @keyframes ambientLightSweep {
          0%, 100% {
            opacity: 0.35;
            transform: translate(0, 0) scale(1);
          }
          50% {
            opacity: 0.6;
            transform: translate(20px, -15px) scale(1.06);
          }
        }
        .animate-gentle-float {
          animation: gentleFloat 7s ease-in-out infinite;
        }
        .animate-ambient-light-1 {
          animation: ambientLightSweep 14s ease-in-out infinite;
        }
        .animate-ambient-light-2 {
          animation: ambientLightSweep 18s ease-in-out infinite reverse;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-gentle-float,
          .animate-ambient-light-1,
          .animate-ambient-light-2 {
            animation: none !important;
          }
        }
      `}</style>

      {/* Decorative Mint & Teal Flowing Background Waves (Matching Reference Screenshot) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden select-none z-0">
        {/* Soft Ambient Light Glows */}
        <div className="absolute -top-[15%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-br from-emerald-200/40 via-teal-100/30 to-transparent blur-3xl animate-ambient-light-1" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-tl from-teal-100/40 to-transparent blur-3xl animate-ambient-light-2" />

        {/* Top-Left Subtle Curved Ribbon */}
        <svg
          className="absolute -top-12 -left-12 w-[50vw] max-w-[650px] h-[300px] opacity-35"
          viewBox="0 0 650 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,0 L600,0 C480,140 280,220 0,180 Z"
            fill="url(#topWaveGradient1)"
          />
          <path
            d="M0,0 L420,0 C340,100 180,160 0,130 Z"
            fill="url(#topWaveGradient2)"
            opacity="0.6"
          />
          <defs>
            <linearGradient id="topWaveGradient1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#a7f3d0" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="topWaveGradient2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Bottom Flowing Organic Waves Sweeping Left-to-Right */}
        <svg
          className="absolute bottom-0 left-0 w-full h-[260px] sm:h-[320px] lg:h-[400px] opacity-75"
          viewBox="0 0 1440 400"
          fill="none"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,400 L0,220 C220,290 380,170 680,260 C980,350 1200,240 1440,300 L1440,400 Z"
            fill="url(#bottomWaveGradient1)"
            opacity="0.35"
          />
          <path
            d="M0,400 L0,270 C180,330 340,230 600,310 C860,390 1140,290 1440,350 L1440,400 Z"
            fill="url(#bottomWaveGradient2)"
            opacity="0.5"
          />
          <path
            d="M0,400 L0,320 C140,370 280,290 480,350 C740,420 1020,330 1440,380 L1440,400 Z"
            fill="url(#bottomWaveGradient3)"
            opacity="0.65"
          />
          <defs>
            <linearGradient id="bottomWaveGradient1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="45%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#d1fae5" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="bottomWaveGradient2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#047857" />
              <stop offset="35%" stopColor="#10b981" />
              <stop offset="85%" stopColor="#a7f3d0" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="bottomWaveGradient3" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#065f46" />
              <stop offset="25%" stopColor="#059669" />
              <stop offset="65%" stopColor="#6ee7b7" />
              <stop offset="100%" stopColor="#ecfdf5" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ====================================================================
          TOP BAR: Brand Header (Left) & Secure & Encrypted Indicator (Right)
         ==================================================================== */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between relative z-20 py-2 sm:py-3 px-2 sm:px-4">
        {/* Top-Left Logo & Wordmark (Clean, unobtrusive branding) */}
        <div className="flex items-center gap-3">
          <img
            src="/Motolend_logo.png"
            alt="MotoLend Logo"
            className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl object-contain shadow-xs bg-white/60 p-0.5 border border-emerald-100"
          />
          <div>
            <div className="text-xl sm:text-2xl font-black tracking-tight flex items-center leading-none">
              <span className="text-[#043e35]">Moto</span>
              <span className="text-[#009B67]">Lend</span>
            </div>
            <div className="text-[8px] sm:text-[9px] tracking-[0.24em] font-bold text-emerald-800/80 uppercase mt-0.5">
              POWERING SMARTER FINANCE
            </div>
          </div>
        </div>

        {/* Top-Right: Secure & Encrypted Badge */}
        <aside
          aria-label="Security status"
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-800 bg-white/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-emerald-200/60 shadow-2xs"
        >
          <Lock className="w-3.5 h-3.5 text-[#009B67] fill-[#009B67]" />
          <span>Secure &amp; Encrypted</span>
        </aside>
      </header>

      {/* ====================================================================
          MAIN TWO-COLUMN STAGE:
          LEFT: Large Seamless Finance Illustration (No text, naturally blended)
          RIGHT: Exact Reference Image 1 Login Card
         ==================================================================== */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-6 lg:gap-8 xl:gap-12 relative z-10 py-2 sm:py-4 lg:py-6">
        
        {/* ==================================================================
            LEFT COLUMN: Large Seamless Finance Illustration
            - Zero promotional text, zero headings, zero description
            - No visible rectangular container or card boundaries
            - Progressive multi-stop edge feathering eliminates hard edges
            - Blends naturally into the continuous mint-green page background
           ================================================================== */}
        <section
          aria-label="MotoLend Finance Overview"
          className="w-full lg:w-[53%] xl:w-[56%] flex-1 flex items-center justify-center relative min-h-[260px] sm:min-h-[360px] lg:min-h-[540px] xl:min-h-[600px] px-2 sm:px-4"
        >
          {/* Seamlessly integrated illustration without any rectangular container or borders */}
          <div className="relative z-10 w-full max-w-[440px] sm:max-w-[540px] lg:max-w-[660px] xl:max-w-[740px] 2xl:max-w-[800px] flex items-center justify-center animate-gentle-float">
            <img
              src="/MotoLend illustration.png"
              alt="MotoLend Finance and Loan Management"
              className="w-full h-auto max-h-[76vh] object-contain select-none pointer-events-none drop-shadow-none"
              style={{
                maskImage:
                  'radial-gradient(ellipse 90% 88% at 48% 50%, #000 62%, rgba(0,0,0,0.88) 75%, rgba(0,0,0,0.45) 86%, rgba(0,0,0,0.06) 96%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 90% 88% at 48% 50%, #000 62%, rgba(0,0,0,0.88) 75%, rgba(0,0,0,0.45) 86%, rgba(0,0,0,0.06) 96%, transparent 100%)',
              }}
            />
          </div>
        </section>

        {/* ==================================================================
            RIGHT COLUMN: Exact Login Card (Reference Image 1)
           ================================================================== */}
        <section
          aria-label="User Login"
          className="w-full lg:w-[48%] xl:w-[44%] flex justify-center items-center py-2 lg:py-0"
        >
          {/* Central Card Container */}
          <div className="w-full max-w-[430px] sm:max-w-[450px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(4,45,34,0.08)] border border-white/90 p-6 sm:p-8 relative shrink-0">
            
            {/* Card Header: Centered Logo & Tagline */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="flex items-center gap-2.5 mb-1.5">
                <img
                  src="/Motolend_logo.png"
                  alt="MotoLend Logo"
                  className="h-9 w-9 rounded-lg object-contain shadow-2xs"
                />
                <div className="text-2xl font-black tracking-tight flex items-center leading-none">
                  <span className="text-[#043e35]">Moto</span>
                  <span className="text-[#009B67]">Lend</span>
                </div>
              </div>
              <div className="text-[8px] tracking-[0.22em] font-bold text-emerald-800/80 uppercase">
                POWERING SMARTER FINANCE
              </div>
            </div>

            {/* Heading & Subtitle */}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-[26px] font-extrabold text-[#043e35] tracking-tight">
                Welcome Back
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
                Log in to continue to your account
              </p>
            </div>

            {/* Error Notification Alert */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium animate-in fade-in duration-200"
              >
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-700 cursor-pointer p-0.5"
                  aria-label="Dismiss error"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Info Notification Alert (Forgot Password / Support) */}
            {infoMessage && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium animate-in fade-in duration-200"
              >
                <Info className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                <span className="leading-relaxed flex-1">{infoMessage}</span>
                <button
                  type="button"
                  onClick={() => setInfoMessage('')}
                  className="text-emerald-500 hover:text-emerald-800 cursor-pointer p-0.5"
                  aria-label="Dismiss message"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Login Form (preserves all existing inputs and submit logic) */}
            <form onSubmit={handleLogin} noValidate className="space-y-4">
              
              {/* Username Field */}
              <div className="space-y-1">
                <label
                  htmlFor="username-field"
                  className="text-xs font-semibold text-slate-700 block"
                >
                  Username
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
                    placeholder="Enter your username"
                    autoComplete="username"
                    className={`w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm text-slate-800 bg-white border rounded-xl outline-none transition-all placeholder:text-slate-400 ${
                      fieldErrors.identifier
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                        : 'border-slate-200 focus:border-[#009B67] focus:ring-2 focus:ring-[#009B67]/15'
                    }`}
                  />
                </div>
                {fieldErrors.identifier && (
                  <p className="text-[11px] font-medium text-rose-600 mt-1">
                    {fieldErrors.identifier}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <label
                  htmlFor="password-field"
                  className="text-xs font-semibold text-slate-700 block"
                >
                  Password
                </label>
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
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className={`w-full pl-10 pr-10 py-2.5 sm:py-3 text-sm text-slate-800 bg-white border rounded-xl outline-none transition-all placeholder:text-slate-400 ${
                      fieldErrors.password
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                        : 'border-slate-200 focus:border-[#009B67] focus:ring-2 focus:ring-[#009B67]/15'
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
                  <p className="text-[11px] font-medium text-rose-600 mt-1">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password Row */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    id="remember-me-checkbox"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#009B67] focus:ring-[#009B67]/20 accent-[#009B67] cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium">
                    Remember me
                  </span>
                </label>

                <button
                  id="forgot-password-button"
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-semibold text-[#009B67] hover:text-[#007f54] hover:underline cursor-pointer transition-colors"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Green Gradient Sign In Button */}
              <button
                id="login-submit-button"
                type="submit"
                disabled={isLoading}
                className="w-full mt-3 py-3 sm:py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#009B67] to-[#00b074] hover:from-[#00875a] hover:to-[#009b67] active:scale-[0.99] text-white text-sm sm:text-base font-bold shadow-md shadow-emerald-700/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4 ml-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Divider: "Your trusted finance partner" */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100" />
              </div>
              <span className="relative bg-white px-3 text-[11px] text-slate-400 font-medium">
                Your trusted finance partner
              </span>
            </div>

            {/* Bottom 3 Trust Indicators with Subtle Dividers */}
            <div className="flex items-center justify-between gap-1 sm:gap-2 pt-1">
              {/* Feature 1: Your Data is Safe */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-center">
                <ShieldCheck className="w-5 h-5 text-[#009B67] shrink-0" />
                <div className="text-left">
                  <div className="text-[10.5px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                    Your Data
                  </div>
                  <div className="text-[9.5px] sm:text-[10px] text-slate-500 font-medium">
                    is Safe
                  </div>
                </div>
              </div>

              {/* Vertical Divider */}
              <div className="h-6 w-[1px] bg-slate-200 shrink-0" />

              {/* Feature 2: Bank-Grade Security */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-center">
                <Landmark className="w-5 h-5 text-[#009B67] shrink-0" />
                <div className="text-left">
                  <div className="text-[10.5px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                    Bank-Grade
                  </div>
                  <div className="text-[9.5px] sm:text-[10px] text-slate-500 font-medium">
                    Security
                  </div>
                </div>
              </div>

              {/* Vertical Divider */}
              <div className="h-6 w-[1px] bg-slate-200 shrink-0" />

              {/* Feature 3: Dedicated Support */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-center">
                <Headphones className="w-5 h-5 text-[#009B67] shrink-0" />
                <div className="text-left">
                  <div className="text-[10.5px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                    Dedicated
                  </div>
                  <div className="text-[9.5px] sm:text-[10px] text-slate-500 font-medium">
                    Support
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* Subtle Bottom Footer Spacer */}
      <footer className="w-full text-center py-2 relative z-10 text-[11px] text-slate-400 font-medium">
        &copy; {new Date().getFullYear()} MotoLend Auto Finance System. All rights reserved.
      </footer>

    </div>
  );
};

export default Login;
