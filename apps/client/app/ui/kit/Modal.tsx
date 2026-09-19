import { type ReactNode, useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A blocking dialog. Built on `role="dialog"` rather than `<dialog>.showModal()`
 * so it behaves identically under jsdom. Focus moves in on open, Tab wraps
 * inside, Escape and a backdrop click close it, and focus returns to whatever
 * had it before. Render it conditionally: mounted means open.
 */
export function Modal({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog)?.focus();
    return () => previous?.focus?.();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="cc-modal"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="cc-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        {actions && <div className="cc-modal__actions">{actions}</div>}
      </div>
    </div>
  );
}
