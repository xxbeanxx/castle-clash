import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { Layout } from "./root.js";

describe("Layout", () => {
  it("loads /config.js before the app bundle so window.__CONFIG__ is set in time", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <Layout>
            <p>ok</p>
          </Layout>
        ),
      },
    ]);

    const html = renderToStaticMarkup(<Stub initialEntries={["/"]} />);

    expect(html).toContain('<script src="/config.js">');
  });
});
