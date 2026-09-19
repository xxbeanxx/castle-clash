import { privatePageMeta } from "../meta.js";
import { ButtonLink } from "../ui/kit/index.js";

export const meta = () => privatePageMeta("Page not found");

/** The catch-all route: a page that doesn't exist, inside the normal site chrome. */
export default function NotFound() {
  return (
    <div className="cc-page cc-page--narrow">
      <h1>Page not found</h1>
      <p className="cc-prose">
        There is nothing at this address. The link may be old, or mistyped.
      </p>
      <div className="cc-row">
        <ButtonLink to="/" variant="primary">
          Back to the keep
        </ButtonLink>
        <ButtonLink to="/lobby">Play</ButtonLink>
      </div>
    </div>
  );
}
