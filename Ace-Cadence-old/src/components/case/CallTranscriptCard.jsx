import { Phone, Play } from 'lucide-react';
import DetailCard from './DetailCard';

export default function CallTranscriptCard({ transcript, hasRecording = true }) {
  return (
    <DetailCard icon={Phone} title="Call Transcript & Recording">
      <div className="space-y-3">
        {hasRecording && (
          <div className="flex items-center gap-3 bg-surface rounded-lg border border-border px-3 py-2.5">
            <button
              type="button"
              disabled
              title="Playback will be enabled once this module is connected"
              className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5 ml-0.5" />
            </button>
            <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full w-0 bg-accent rounded-full" />
            </div>
            <span className="text-xs text-muted font-data">--:--</span>
          </div>
        )}
        {transcript ? (
          <pre className="text-xs text-gray-600 font-data whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed bg-white rounded-lg p-3 border border-border">
            {transcript}
          </pre>
        ) : (
          <p className="text-sm text-muted italic">No transcript available yet.</p>
        )}
      </div>
    </DetailCard>
  );
}
