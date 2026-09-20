/** Shown by CSS alone (`touch.css`) in portrait on a touch device: no state, no listeners, and it
 *  disappears the moment the device turns. Renders on every `/play`, hidden elsewhere. */
export function RotatePrompt() {
  return (
    <div className="cc-rotate" role="alert" data-testid="rotate-prompt">
      <svg
        className="cc-rotate__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
      <p>Rotate your device to play</p>
    </div>
  );
}
