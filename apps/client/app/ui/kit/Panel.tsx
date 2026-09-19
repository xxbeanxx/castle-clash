import type { ElementType, HTMLAttributes, ReactNode } from "react";

/**
 * A titled surface. `title` renders as an `h2` by default; pass `headingLevel`
 * when the panel nests under another heading so the outline stays correct.
 */
export function Panel({
  title,
  headingLevel = 2,
  as: Tag = "section",
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  as?: ElementType;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Tag className={["cc-panel", className].filter(Boolean).join(" ")} {...rest}>
      {title && <Heading className="cc-panel__title">{title}</Heading>}
      {children}
    </Tag>
  );
}
