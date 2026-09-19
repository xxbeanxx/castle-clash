import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from "react";

interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * Label + control + hint/error, wired for screen readers. The control is a
 * render prop so `Field` owns the ids without cloning elements:
 *
 *   <Field label="Email" error={err}>{(p) => <Input type="email" {...p} />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");
  const props: ControlProps = { id };
  if (describedBy) {
    props["aria-describedby"] = describedBy;
  }
  if (error) {
    props["aria-invalid"] = true;
  }
  return (
    <div className="cc-field">
      <label className="cc-field__label" htmlFor={id}>
        {label}
      </label>
      {children(props)}
      {hint && (
        <p id={hintId} className="cc-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="cc-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={["cc-input", className].filter(Boolean).join(" ")} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={["cc-input", className].filter(Boolean).join(" ")} {...rest} />;
}
