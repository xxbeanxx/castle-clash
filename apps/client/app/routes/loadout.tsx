import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  WEAPON_IDS,
  type CosmeticSlot,
  type WeaponId,
} from "@castle-clash/shared";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import { getMyLoadout, getMyUnlocks, saveMyLoadout, type ClientLoadout } from "../auth/supabase.js";
import { LoadoutPreview } from "../ui/LoadoutPreview.js";

/** A small, fixed set of selectable colors (plan Phase 9 step 4: "color
 *  pickers limited to the palette") — a native `<input type="color">`
 *  would let a player pick any of 16 million values, which the RLS layer
 *  has no opinion on but the plan's own wording rules out. */
const TINT_PALETTE = [
  0xffffff, 0xff4444, 0xffaa00, 0xffee00, 0x44dd44, 0x2299ff, 0x8844ff, 0x333333,
];

const WEAPON_LABELS: Record<WeaponId, string> = {
  [WEAPON_IDS.SWORD]: "Sword",
  [WEAPON_IDS.MACE]: "Mace",
  [WEAPON_IDS.SPEAR]: "Spear",
};

const SLOT_LABELS: Record<CosmeticSlot, string> = {
  [COSMETIC_SLOTS.HELMET]: "Helmet",
  [COSMETIC_SLOTS.CAPE]: "Cape",
  [COSMETIC_SLOTS.WEAPON_STYLE]: "Weapon style",
};

const SLOT_FIELDS = {
  [COSMETIC_SLOTS.HELMET]: "helmetId",
  [COSMETIC_SLOTS.CAPE]: "capeId",
  [COSMETIC_SLOTS.WEAPON_STYLE]: "weaponStyleId",
} as const satisfies Record<CosmeticSlot, keyof ClientLoadout>;

/** `saveMyLoadout`'s rejection is usually a Supabase `PostgrestError` (e.g.
 *  RLS's `player_owns_cosmetics()` check failing an unowned selection) —
 *  a plain object with a string `message`, not an `Error` instance, so
 *  `error instanceof Error` alone would print `"[object Object]"` for the
 *  most common failure this form can actually hit. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

export async function clientLoader(): Promise<{
  loadout: ClientLoadout;
  unlocks: readonly string[];
}> {
  await requireSession();
  const [loadout, unlocks] = await Promise.all([getMyLoadout(), getMyUnlocks()]);
  return { loadout, unlocks };
}

function TintSwatch({
  color,
  selected,
  onSelect,
}: {
  color: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={hex}
      aria-pressed={selected}
      style={{
        width: 28,
        height: 28,
        background: hex,
        border: selected ? "3px solid white" : "1px solid #666",
        borderRadius: 4,
        cursor: "pointer",
      }}
    />
  );
}

function CosmeticSlotPicker({
  slot,
  selectedId,
  owned,
  onSelect,
}: {
  slot: CosmeticSlot;
  selectedId: string;
  owned: ReadonlySet<string>;
  onSelect: (itemId: string) => void;
}) {
  const items = COSMETIC_CATALOG.filter((item) => item.slot === slot);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span>{SLOT_LABELS[slot]}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((item) => {
          const isOwned = item.unlock.type === "default" || owned.has(item.id);
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!isOwned}
              onClick={() => onSelect(item.id)}
              title={isOwned ? item.name : `${item.name} (locked)`}
              style={{
                padding: "4px 8px",
                border: isSelected ? "2px solid white" : "1px solid #666",
                borderRadius: 4,
                background: isOwned ? "#222" : "#111",
                color: isOwned ? "white" : "#666",
                cursor: isOwned ? "pointer" : "not-allowed",
              }}
            >
              {item.name}
              {!isOwned && " (locked)"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Loadout() {
  const { loadout: initialLoadout, unlocks } = useLoaderData<typeof clientLoader>();
  const [loadout, setLoadout] = useState<ClientLoadout>(initialLoadout);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const owned = new Set(unlocks);

  const helmetTint = COSMETIC_CATALOG.find((item) => item.id === loadout.helmetId)?.tint;
  const capeTint = COSMETIC_CATALOG.find((item) => item.id === loadout.capeId)?.tint;

  function updateSlot(slot: CosmeticSlot, itemId: string): void {
    setLoadout((prev) => ({ ...prev, [SLOT_FIELDS[slot]]: itemId }));
    setStatus(null);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setStatus(null);
    try {
      await saveMyLoadout(loadout);
      setStatus("Saved.");
    } catch (error) {
      setStatus(`Failed to save: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 480 }}>
      <h1>Loadout</h1>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <LoadoutPreview tint={loadout.tintPrimary} helmetTint={helmetTint} capeTint={capeTint} />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Weapon</span>
            <select
              value={loadout.weapon}
              onChange={(event) => {
                setLoadout((prev) => ({ ...prev, weapon: event.target.value as WeaponId }));
                setStatus(null);
              }}
            >
              {Object.values(WEAPON_IDS).map((weapon) => (
                <option key={weapon} value={weapon}>
                  {WEAPON_LABELS[weapon]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span id="tint-primary-label">Primary tint</span>
            <div
              role="group"
              aria-labelledby="tint-primary-label"
              style={{ display: "flex", gap: 6 }}
            >
              {TINT_PALETTE.map((color) => (
                <TintSwatch
                  key={color}
                  color={color}
                  selected={loadout.tintPrimary === color}
                  onSelect={() => {
                    setLoadout((prev) => ({ ...prev, tintPrimary: color }));
                    setStatus(null);
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span id="tint-secondary-label">Secondary tint</span>
            <div
              role="group"
              aria-labelledby="tint-secondary-label"
              style={{ display: "flex", gap: 6 }}
            >
              {TINT_PALETTE.map((color) => (
                <TintSwatch
                  key={color}
                  color={color}
                  selected={loadout.tintSecondary === color}
                  onSelect={() => {
                    setLoadout((prev) => ({ ...prev, tintSecondary: color }));
                    setStatus(null);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <CosmeticSlotPicker
        slot={COSMETIC_SLOTS.HELMET}
        selectedId={loadout.helmetId ?? "helmet-none"}
        owned={owned}
        onSelect={(itemId) => updateSlot(COSMETIC_SLOTS.HELMET, itemId)}
      />
      <CosmeticSlotPicker
        slot={COSMETIC_SLOTS.CAPE}
        selectedId={loadout.capeId ?? "cape-none"}
        owned={owned}
        onSelect={(itemId) => updateSlot(COSMETIC_SLOTS.CAPE, itemId)}
      />
      <CosmeticSlotPicker
        slot={COSMETIC_SLOTS.WEAPON_STYLE}
        selectedId={loadout.weaponStyleId ?? "weaponStyle-none"}
        owned={owned}
        onSelect={(itemId) => updateSlot(COSMETIC_SLOTS.WEAPON_STYLE, itemId)}
      />

      <button type="button" onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Saving..." : "Save loadout"}
      </button>
      {status && <p>{status}</p>}
    </div>
  );
}
