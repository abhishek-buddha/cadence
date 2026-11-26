import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import StatusBadge from '../../components/StatusBadge';

export default function StatusPicker({ value, options, label, disabled, onChange }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const open = !!position && !disabled;
  function close() { setPosition(null); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    const dismiss = e => {
      if (!menu.current?.contains(e.target) && !trigger.current?.contains(e.target)) setPosition(null);
    };
    const hide = () => setPosition(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open]);
  return <>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      className="rounded-full transition-shadow hover:ring-2 hover:ring-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      onClick={e => {
        e.stopPropagation();
        if (open) return close();
        const rect = e.currentTarget.getBoundingClientRect();
        const height = options.length * 40 + 16;
        setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 208)), top: rect.bottom + height + 8 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6) });
      }}><StatusBadge status={value} /></button>
    {open && createPortal(<div ref={menu} role="menu" aria-label={label} style={position}
      className="fixed z-[10000] w-[200px] rounded-xl border border-border bg-white p-1.5 shadow-xl shadow-gray-900/15"
      onClick={e => e.stopPropagation()} onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Tab') setPosition(null);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const items = [...menu.current.querySelectorAll('[role="menuitemradio"]')];
          const index = items.indexOf(document.activeElement);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus({ preventScroll: true });
        }
      }}>
      {options.map(([key, name]) => <button type="button" key={key} role="menuitemradio" aria-checked={key === value} aria-label={name}
        className={`w-full h-10 flex items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-accent/10 ${key === value ? 'bg-accent/5' : ''}`}
        onClick={() => { close(); if (key !== value) onChange(key); }}>
        <StatusBadge status={key} />{key === value && <Check size={15} className="text-accent" aria-hidden="true" />}
      </button>)}
    </div>, document.body)}
  </>;
}
