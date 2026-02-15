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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Activity className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tight text-gray-900">
            Cadence
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
            Claims AI
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-muted" />
          <h2 className="font-display font-semibold text-lg text-gray-900">
            Enter Access Code
          </h2>
        </div>
        <p className="text-sm text-muted text-center mb-8">
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
                  ? 'border-danger bg-danger-dim/30 text-danger'
                  : d
                    ? 'border-accent bg-accent/5 text-gray-900'
                    : 'border-border-light bg-white text-gray-900 focus:border-accent focus:bg-accent/5'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-danger text-center mb-4 animate-fade-in">
            Invalid access code. Please try again.
          </p>
        )}

        {/* Submit button */}
        <button
          onClick={() => submit(digits.join(''))}
          disabled={digits.some((d) => !d)}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-lg bg-accent text-white font-display font-semibold text-sm hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <p className="mt-12 text-xs text-muted/40 font-data">v0.1.0</p>
    </div>
  );
}
