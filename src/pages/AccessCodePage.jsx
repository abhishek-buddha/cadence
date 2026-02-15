import { useState, useRef, useEffect } from 'react';
import { Activity, Lock, ArrowRight } from 'lucide-react';

const CODE_LENGTH = 6;
const VALID_CODE = '472394';

export default function AccessCodePage({ onSuccess }) {
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index, value) {
    if (!/^\d*$/.test(value)) return;

    const char = value.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError(false);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all filled
    if (char && index === CODE_LENGTH - 1) {
      const code = next.join('');
      if (code.length === CODE_LENGTH) {
        setTimeout(() => submit(code), 150);
      }
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      submit(digits.join(''));
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    setError(false);
    if (pasted.length === CODE_LENGTH) {
      setTimeout(() => submit(pasted), 150);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  }

  function submit(code) {
    if (code === VALID_CODE) {
      onSuccess();
    } else {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* Video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/access-bg.mp4" type="video/mp4" />
      </video>

      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-white">
              Cadence
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-medium">
              Claims AI
            </p>
          </div>
        </div>

        {/* Glass card */}
        <div className="w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-white/70" />
            <h2 className="font-display font-semibold text-lg text-white">
              Enter Access Code
            </h2>
          </div>
          <p className="text-sm text-white/60 text-center mb-8">
            Enter your 6-digit code to continue
          </p>

          {/* Code inputs */}
          <div
            className={`flex items-center justify-center gap-2.5 mb-6 ${shaking ? 'animate-shake' : ''}`}
            onPaste={handlePaste}
          >
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`w-12 h-14 text-center text-xl font-data font-semibold rounded-lg border-2 outline-none transition-all duration-200 ${
                  error
                    ? 'border-red-400 bg-red-500/20 text-red-200'
                    : d
                      ? 'border-white/50 bg-white/15 text-white'
                      : 'border-white/20 bg-white/5 text-white focus:border-white/50 focus:bg-white/15'
                }`}
              />
            ))}
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-300 text-center mb-4 animate-fade-in">
              Invalid access code. Please try again.
            </p>
          )}

          {/* Submit button */}
          <button
            onClick={() => submit(digits.join(''))}
            disabled={digits.some((d) => !d)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-lg bg-white text-gray-900 font-display font-semibold text-sm hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-10 text-xs text-white/30 font-data">v0.1.0</p>
      </div>
    </div>
  );
}
