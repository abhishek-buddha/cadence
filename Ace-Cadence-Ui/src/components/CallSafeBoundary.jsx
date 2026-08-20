// Error boundary for panels rendered *during a live call*.
//
// Without one, a render error anywhere in the operator workspace unmounts the
// whole React tree — and useSoftphone's unmount cleanup calls
// call.disconnect() + device.destroy(), so a data bug silently HANGS UP on the
// insurance rep. That is exactly what happened when api.claimFollowups was
// undefined: blank page, dead audio, mid-call.
//
// A panel failing to render must never cost the call. Keep the boundary tight
// around the panel, not the page, so the softphone controls stay mounted.

import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class CallSafeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Left as console output on purpose: there is no error-reporting sink in
    // this app yet, and losing the stack would make the next one of these much
    // harder to find.
    console.error('[CallSafeBoundary] panel failed to render', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warn shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {this.props.label || 'This panel'} could not load
          </p>
          <p className="text-xs text-muted mt-0.5">
            The call is unaffected — you can keep talking. Details are in the browser console.
          </p>
        </div>
      </div>
    );
  }
}
