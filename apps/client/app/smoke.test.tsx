import { TICK_RATE } from "@castle-clash/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./routes/home.js";

describe("workspace resolution", () => {
  it("resolves @castle-clash/shared from apps/client", () => {
    expect(TICK_RATE).toBe(60);
  });

  it("renders the TICK_RATE value in the home route", () => {
    render(<Home />);
    expect(screen.getByText(/TICK_RATE: 60/)).toBeDefined();
  });
});
