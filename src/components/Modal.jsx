import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, wide = false }) {
  const scrollRef = useRef(null);

  // Lock body scroll & handle Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Scrollable container — keeps modal centered when short, scrollable when tall */}
      <div
        ref={scrollRef}
        className="relative z-10 overflow-y-auto h-full flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === scrollRef.current) onClose(); }}
      >
        {/* Modal */}
        <div className={`relative bg-panel border border-border rounded-xl shadow-2xl animate-fade-in my-auto ${
          wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-display font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-panel-light transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
