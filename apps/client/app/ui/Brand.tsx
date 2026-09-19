/** The wordmark: a crenellated tower drawn from plain rects, then the name. */
export function Brand() {
  return (
    <span className="cc-brand">
      <svg
        className="cc-brand__mark"
        viewBox="0 0 16 16"
        width="28"
        height="28"
        aria-hidden="true"
        focusable="false"
        shapeRendering="crispEdges"
      >
        <path fill="currentColor" d="M2 2h3v3h2V2h2v3h2V2h3v6h-2v6H4V8H2z" />
        <path fill="var(--stone-950)" d="M7 10h2v4H7z" />
      </svg>
      <span className="cc-brand__name">Castle Clash</span>
    </span>
  );
}
