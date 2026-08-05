// Placeholder for routes whose page still depends on the pre-rewrite
// Convex-wired component. Rendering the real (unconverted) component here
// would crash immediately — there's no ConvexProvider in this app anymore
// (see src/main.jsx) — so every not-yet-converted route points here instead
// until its data layer is ported to the new REST/WebSocket backend. The
// original source is still in Ace-Cadence-old/src for reference.

import { Construction } from 'lucide-react';

export default function NotYetMigrated({ label }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-20 animate-fade-in">
      <Construction className="w-10 h-10 text-muted/40 mb-4" />
      <h2 className="font-display font-semibold text-lg text-gray-900 mb-1">Not yet migrated</h2>
      <p className="text-sm text-muted max-w-sm">
        {label || 'This screen'} hasn't been rewired to the new backend yet — it still depends on
        Convex. See Ace-Cadence-Ui/README.md for what's converted so far.
      </p>
    </div>
  );
}
