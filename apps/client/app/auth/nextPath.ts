/**
 * `?next=` is user-controlled input that ends up in a redirect, so it is only
 * ever honoured as a same-origin path. Anything else (an absolute URL, a
 * protocol-relative `//host`, a backslash trick, the login page itself) is
 * dropped and the caller falls back to its default.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, "http://placeholder.invalid");
  } catch {
    return null;
  }
  if (
    url.origin !== "http://placeholder.invalid" ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/auth/")
  ) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where a guarded route sends an unauthenticated visitor, remembering where they were headed. */
export function loginPathFor(request: Request): string {
  const url = new URL(request.url);
  const target = `${url.pathname}${url.search}`;
  return `/login?next=${encodeURIComponent(target)}`;
}
