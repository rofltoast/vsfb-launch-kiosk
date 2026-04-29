/**
 * MobileThemeButton — floating theme cycler for touch viewers.
 *
 * Why this exists: the kiosk's theme switcher is keyboard-driven (`T`
 * opens the picker, number keys jump to a palette). On a phone there's
 * no keyboard, so without a tap-target the theme picker is unreachable.
 *
 * Behavior:
 *   - Single tap         → cycle to the next palette in the active set.
 *                          Active set is terminal-themes when the
 *                          ambient layout is 'terminal', polished-themes
 *                          when it's 'polished'.
 *   - Hidden by default  → only renders when CSS media query says we're
 *                          on a narrow viewport (handled in base.css via
 *                          .mobile-theme-btn { display: none } / shown
 *                          inside @media (max-width: 768px)).
 *
 * The button shows an emoji + the active palette's short label so users
 * can see where they are in the cycle. Tap again to advance.
 *
 * Persistence: parent App writes the new theme to localStorage on the
 * setTheme/setPolishedTheme call (existing behavior, unchanged).
 */
const TERMINAL_THEMES = [
  'tokyo-storm', 'gruvbox', 'dracula', 'nord',
  'matrix', 'catppuccin', 'solarized',
];
const POLISHED_THEMES = [
  'cosmic-dusk', 'aurora', 'ember',
  'midnight-ops', 'graphite', 'sunrise',
];

export function MobileThemeButton({
  layout,
  theme,
  polishedTheme,
  setTheme,
  setPolishedTheme,
}) {
  const isPolished = layout === 'polished';
  const list = isPolished ? POLISHED_THEMES : TERMINAL_THEMES;
  const current = isPolished ? polishedTheme : theme;
  const apply = isPolished ? setPolishedTheme : setTheme;

  const cycle = () => {
    const idx = list.indexOf(current);
    const next = list[(idx + 1) % list.length];
    apply(next);
  };

  // Show the next theme name as a hint so users know what tap-cycling
  // will land on. Falls back to the current label if `current` isn't in
  // the active set (e.g. just flipped layout types and the persisted
  // theme is from the other palette family).
  const idx = list.indexOf(current);
  const nextLabel = idx === -1
    ? (current || 'theme')
    : list[(idx + 1) % list.length];

  return (
    <button
      type="button"
      className="mobile-theme-btn"
      aria-label="cycle theme"
      title={`Tap to switch theme (next: ${nextLabel})`}
      onClick={cycle}
    >
      <span aria-hidden="true" className="mtb-icon">🎨</span>
      <span className="mtb-label">{(current || '').replace(/-/g, ' ')}</span>
    </button>
  );
}
