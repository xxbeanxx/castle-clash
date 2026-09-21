import type { CSSProperties } from "react";
import { powerUpIconTile } from "../content/powerups.js";

/**
 * One power-up's pixel icon, cut from `public/assets/ui/powerups.png` by CSS (`.cc-icon` in game.css).
 * The tile position is data, so it is passed as custom properties, the one thing inline style is for
 * here. Decorative: the card next to it says the name, so it is hidden from assistive technology.
 * Renders nothing for an id without an icon.
 */
export function PowerUpIcon({ id }: { id: string }) {
  const tile = powerUpIconTile(id);
  if (!tile) {
    return null;
  }
  const style = { "--tile-x": tile.column, "--tile-y": tile.row } as CSSProperties;
  return <span aria-hidden="true" className="cc-icon" style={style} />;
}
