import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { CONTROLS } from "../content/controls.js";
import About from "./about.js";
import HowToPlay from "./how-to-play.js";
import Privacy from "./privacy.js";
import Terms from "./terms.js";

afterEach(cleanup);

function renderPage(Component: () => React.JSX.Element) {
  const router = createMemoryRouter([{ path: "*", Component }], { initialEntries: ["/"] });
  render(<RouterProvider router={router} />);
}

describe("static pages", () => {
  it.each([
    ["How to play", HowToPlay],
    ["Privacy policy", Privacy],
    ["Terms of service", Terms],
    ["About Castle Clash", About],
  ])("%s renders one h1 and content", (title, Component) => {
    renderPage(Component);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
  });

  it("privacy and terms carry a last-updated date and cross-link", () => {
    renderPage(Privacy);
    expect(screen.getByText(/Last updated/)).toBeTruthy();
    cleanup();
    renderPage(Terms);
    expect(screen.getByText(/Last updated/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "privacy policy" }).getAttribute("href")).toBe(
      "/privacy",
    );
  });

  it("the guide lists every control from the shared list", () => {
    renderPage(HowToPlay);
    const listed = [...document.querySelectorAll("dd")].map((dd) => dd.textContent);
    expect(listed).toEqual(CONTROLS.map((control) => control.action));
  });
});
