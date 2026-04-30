import { useEffect, useState } from 'react';
import {
  getSlipHistory,
  hasRecentSlip,
  formatDelta,
  formatShortNet,
} from '../lib/slip-history.js';

/**
 * SlipChip — small "NET UPDATED" pill + recent-slip strip.
 *
 * Shown next to the LIFTOFF row in both ambient layouts when there's
 * been a NET (No Earlier Than) change for this launch within the last
 * 6 hours. Quiet and invisible when nothing has slipped — viewers see
 * it appear only when something genuinely happened.
 *
 * The strip beneath the chip lists the last 3 slips as
 *   `WED 11:00 PM → THU 07:00 AM (+8h 0m)`
 * so a viewer can see the slip cadence ("this thing has slipped four
 * times today") without having to keep state in their head.
 *
 * Reads from localStorage on mount + on every poll. We re-poll the
 * storage every 30 seconds so a slip detected by App.jsx during a
 * routine LL2 fetch shows up here without needing a prop drill.
 */
export function SlipChip({ launchId, compact = false }) {
  const [entry, setEntry] = useState(() => getSlipHistory(launchId));

  // Re-read storage on a 30s tick so freshly-detected slips appear in
  // the UI without us having to thread a re-render signal down from
  // App.jsx through AmbientView. Cheap: it's a single localStorage
  // read + JSON.parse of a small object.
  useEffect(() => {
    setEntry(getSlipHistory(launchId));
    const id = setInterval(() => {
      setEntry(getSlipHistory(launchId));
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [launchId]);

  if (!entry || !entry.slips || entry.slips.length === 0) return null;
  const recent = hasRecentSlip(entry);

  // Up to 3 most-recent slips, newest first in display order so the
  // freshest news is at the top of the strip.
  const recentSlips = [...entry.slips].slice(-3).reverse();
  const last = entry.slips[entry.slips.length - 1];

  return (
    <div className={`slip-chip-wrap ${compact ? 'slip-compact' : ''}`}>
      {recent && (
        <span
          className="slip-chip"
          aria-label={`NET updated by ${formatDelta(last.deltaSec)}`}
          title="Launch time was recently updated. See history below."
        >
          <span className="slip-dot" /> NET UPDATED {formatDelta(last.deltaSec)}
        </span>
      )}
      <ul className="slip-strip" aria-label="recent NET changes">
        {recentSlips.map((s, i) => (
          <li key={s.observedAt + '-' + i} className="slip-row">
            <span className="slip-from dim">{formatShortNet(s.fromNet)}</span>
            <span className="slip-arrow dim">→</span>
            <span className="slip-to">{formatShortNet(s.toNet)}</span>
            <span
              className={`slip-delta ${s.deltaSec >= 0 ? 'slip-pos' : 'slip-neg'}`}
            >
              ({formatDelta(s.deltaSec)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
