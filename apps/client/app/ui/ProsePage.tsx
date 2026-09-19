import type { ReactNode } from "react";

/** The frame for the long-form pages (guide, privacy, terms, about): one readable column. */
export function ProsePage({
  title,
  updated,
  children,
}: {
  title: string;
  /** Shown as "Last updated", for pages a reader may need to date (privacy, terms). */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <article className="cc-page cc-page--narrow">
      <header className="cc-stack">
        <h1>{title}</h1>
        {updated && <p className="cc-muted">Last updated {updated}</p>}
      </header>
      <div className="cc-prose">{children}</div>
    </article>
  );
}
