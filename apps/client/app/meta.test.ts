import { describe, expect, it } from "vitest";
import { DEFAULT_DESCRIPTION, pageMeta, privatePageMeta, SITE_URL } from "./meta.js";

type Descriptor = Record<string, string>;
const find = (meta: object[], key: string, value: string) =>
  (meta as Descriptor[]).find((entry) => entry[key] === value);

describe("pageMeta", () => {
  it("titles the home page with the site name alone", () => {
    const meta = pageMeta({ path: "/" });
    const title = (meta as Descriptor[]).find((entry) => "title" in entry);
    expect(title?.["title"]).toMatch(/^Castle Clash/);
  });

  it("appends the site name to a page title", () => {
    const meta = pageMeta({ title: "Privacy policy", path: "/privacy" });
    expect((meta as Descriptor[]).find((entry) => "title" in entry)?.["title"]).toBe(
      "Privacy policy | Castle Clash",
    );
  });

  it("always canonicalises to the production origin, with a trailing slash only for the root", () => {
    expect(find(pageMeta({ path: "/" }), "rel", "canonical")?.["href"]).toBe(`${SITE_URL}/`);
    expect(find(pageMeta({ path: "/terms" }), "rel", "canonical")?.["href"]).toBe(
      `${SITE_URL}/terms`,
    );
  });

  it("emits Open Graph and Twitter card tags, with an absolute image URL", () => {
    const meta = pageMeta({ title: "About", path: "/about" });
    expect(find(meta, "property", "og:type")?.["content"]).toBe("website");
    expect(find(meta, "property", "og:image")?.["content"]).toBe(`${SITE_URL}/og.png`);
    expect(find(meta, "name", "twitter:card")?.["content"]).toBe("summary_large_image");
    expect(find(meta, "property", "og:url")?.["content"]).toBe(`${SITE_URL}/about`);
  });

  it("uses the default description unless a page supplies one", () => {
    expect(find(pageMeta({ path: "/" }), "name", "description")?.["content"]).toBe(
      DEFAULT_DESCRIPTION,
    );
    expect(
      find(pageMeta({ path: "/x", description: "Custom" }), "name", "description")?.["content"],
    ).toBe("Custom");
  });
});

describe("privatePageMeta", () => {
  it("titles the page and asks search engines to skip it", () => {
    const meta = privatePageMeta("Play");
    expect((meta as Descriptor[]).find((entry) => "title" in entry)?.["title"]).toBe(
      "Play | Castle Clash",
    );
    expect(find(meta, "name", "robots")?.["content"]).toBe("noindex");
  });
});
