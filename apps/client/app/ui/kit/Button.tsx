import type { ComponentProps } from "react";
import { Link, type LinkProps } from "react-router";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

function buttonClass({ variant = "secondary", size = "md", block }: StyleProps, extra?: string) {
  return [
    "cc-btn",
    variant !== "secondary" && `cc-btn--${variant}`,
    size !== "md" && `cc-btn--${size}`,
    block && "cc-btn--block",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & StyleProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />
  );
}

/** A link that looks like a `Button` — for navigation, where a `<button>` would be the wrong element. */
export function ButtonLink({ variant, size, block, className, ...rest }: LinkProps & StyleProps) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...rest} />;
}
