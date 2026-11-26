import { useState } from 'react';
import { useLocation } from 'react-router-dom';

// Keep the existing desktop navigation and other modules' layouts unchanged.
export default function AppointmentSidebar({ children }) {
  const { pathname } = useLocation();
  const [openPath, setOpenPath] = useState(null);
  if (!pathname.startsWith('/appointments')) return children;
  const open = openPath === pathname;
  return <>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setOpenPath(null)} />}
    <div id="appointment-navigation" className={open ? 'fixed inset-y-0 left-0 z-50 flex shadow-xl md:contents' : 'hidden md:contents'}
      onKeyDown={event => { if (event.key === 'Escape') setOpenPath(null); }}
      onClick={event => { if (event.target.closest('a')) setOpenPath(null); }}>
      {children}
    </div>
    <button type="button" aria-expanded={open} aria-controls="appointment-navigation"
      className="fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium shadow-lg focus-visible:ring-2 focus-visible:ring-accent md:hidden"
      onClick={() => setOpenPath(open ? null : pathname)}>{open ? 'Close navigation' : 'Navigation'}</button>
  </>;
}
