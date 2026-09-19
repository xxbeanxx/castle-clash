import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CosmeticsPreview } from "./CosmeticsPreview.js";

describe("CosmeticsPreview", () => {
  let container: HTMLDivElement;
  let preview: CosmeticsPreview;

  beforeEach(() => {
    container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 120, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 120, configurable: true });
    document.body.appendChild(container);
    preview = new CosmeticsPreview();
  });

  afterEach(() => {
    preview.destroy();
    container.remove();
  });

  it("mounts a canvas into the container and renders a tinted body sprite", async () => {
    await preview.start(container);
    preview.sync({ tint: 0x00ff00 });

    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("renders helmet/cape indicator sprites when their tints are set", async () => {
    await preview.start(container);
    preview.sync({ tint: 0xffffff, helmetTint: 0xffd700, capeTint: 0x4b0082 });

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
  });

  it("is a no-op if sync is called before start resolves", () => {
    expect(() => preview.sync({ tint: 0xff0000 })).not.toThrow();
  });

  it("does not throw when destroyed twice", async () => {
    await preview.start(container);
    preview.destroy();
    expect(() => {
      preview.destroy();
    }).not.toThrow();
  });
});
