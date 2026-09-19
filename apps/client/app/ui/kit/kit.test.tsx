import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, ButtonLink, Field, Input, Modal, Nav, Panel } from "./index.js";

function inRouter(node: React.ReactNode, path = "/") {
  const router = createMemoryRouter([{ path: "*", element: node }], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("type")).toBe("button");
  });

  it("maps variant and size to classes, leaving the secondary/md defaults bare", () => {
    render(
      <>
        <Button>plain</Button>
        <Button variant="primary" size="lg" block>
          big
        </Button>
      </>,
    );
    expect(screen.getByText("plain").className).toBe("cc-btn");
    expect(screen.getByText("big").className).toBe(
      "cc-btn cc-btn--primary cc-btn--lg cc-btn--block",
    );
  });

  it("ButtonLink renders an anchor styled as a button", () => {
    inRouter(<ButtonLink to="/lobby">Lobby</ButtonLink>);
    const link = screen.getByRole("link", { name: "Lobby" });
    expect(link.getAttribute("href")).toBe("/lobby");
    expect(link.className).toContain("cc-btn");
  });
});

describe("Field", () => {
  it("labels the control and wires hint and error into aria-describedby", () => {
    render(
      <Field label="Email" hint="We never share it" error="Required">
        {(props) => <Input {...props} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[0] as string)?.textContent).toBe("We never share it");
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });

  it("adds no aria attributes when there is no hint or error", () => {
    render(<Field label="Name">{(props) => <Input {...props} />}</Field>);
    const input = screen.getByLabelText("Name");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("Panel", () => {
  it("renders its title at the requested heading level", () => {
    render(
      <Panel title="Arenas" headingLevel={3}>
        body
      </Panel>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Arenas" })).toBeTruthy();
  });
});

describe("Modal", () => {
  it("is a labelled modal dialog and closes on Escape and backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Link account" onClose={onClose} actions={<Button>Confirm</Button>}>
        <p>Really?</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Link account" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus in on open, wraps Tab, and restores focus on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <Modal title="T" onClose={() => {}} actions={<Button>Last</Button>}>
        <Button>First</Button>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByText("First"));

    screen.getByText("Last").focus();
    fireEvent.keyDown(screen.getByText("Last"), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("First"));

    fireEvent.keyDown(screen.getByText("First"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("Last"));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("Nav", () => {
  it("marks only the current route", () => {
    inRouter(
      <Nav
        label="Main"
        items={[
          { to: "/", label: "Home", end: true },
          { to: "/leaderboard", label: "Leaderboard" },
        ]}
      />,
      "/leaderboard",
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Leaderboard" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" }).hasAttribute("aria-current")).toBe(false);
  });
});
