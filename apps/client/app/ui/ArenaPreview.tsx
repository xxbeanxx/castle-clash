import { PLAYER_HEIGHT, PLAYER_WIDTH, type ArenaDefinition } from "@castle-clash/shared";
import { arenaLabel } from "../content/arenas.js";

/**
 * A top-down-free, side-on map of an arena drawn from its real definition:
 * the same solids, one-way platforms, hazards and spawn points the sim uses, so
 * it can't drift from the game. Knights are 28x48 rects, the size of the sim
 * hitbox, matching how the game itself draws them today.
 */
export function ArenaPreview({
  arena,
  showKnights = false,
}: {
  arena: ArenaDefinition;
  showKnights?: boolean;
}) {
  const { bounds } = arena;
  const label = arenaLabel(arena.id);
  const knightSpawns = showKnights ? arena.spawns.slice(0, 2) : [];

  return (
    <svg
      className="cc-arena"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      role="img"
      aria-label={`${label} arena layout`}
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="crispEdges"
    >
      <rect
        className="cc-arena__sky"
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
      />
      {arena.hazards.map((hazard) => (
        <rect
          key={hazard.id}
          className={`cc-arena__hazard cc-arena__hazard--${hazard.kind}`}
          x={hazard.box.x}
          y={hazard.box.y}
          width={hazard.box.w}
          height={hazard.box.h}
        />
      ))}
      {arena.solids.map((box, index) => (
        <rect
          key={`s${index}`}
          className="cc-arena__solid"
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
        />
      ))}
      {arena.platforms.map((box, index) => (
        <rect
          key={`p${index}`}
          className="cc-arena__platform"
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
        />
      ))}
      {knightSpawns.map((spawn, index) => (
        <rect
          key={`k${index}`}
          className={
            index === 0
              ? "cc-arena__knight cc-arena__knight--a"
              : "cc-arena__knight cc-arena__knight--b"
          }
          x={spawn.x}
          y={spawn.y}
          width={PLAYER_WIDTH}
          height={PLAYER_HEIGHT}
        />
      ))}
    </svg>
  );
}
