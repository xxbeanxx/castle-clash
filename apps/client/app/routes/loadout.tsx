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
import { WEAPON_LABELS } from "../content/weapons.js";
import { Button, Field, Panel, Select } from "../ui/kit/index.js";
import { LoadoutPreview } from "../ui/LoadoutPreview.js";
import { privatePageMeta } from "../meta.js";

/** A small, fixed set of selectable colors (plan Phase 9 step 4: "color
 *  pickers limited to the palette") — a native `<input type="color">`
 *  would let a player pick any of 16 million values, which the RLS layer
 *  has no opinion on but the plan's own wording rules out. */
const TINT_PALETTE = [
  0xffffff, 0xff4444, 0xffaa00, 0xffee00, 0x44dd44, 0x2299ff, 0x8844ff, 0x333333,
];

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

export const meta = () => privatePageMeta("Loadout");

export async function clientLoader({ request }: { request: Request }): Promise<{
  loadout: ClientLoadout;
  unlocks: readonly string[];
}> {
  await requireSession(request);
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
      className="cc-swatch"
      style={{ background: hex }}
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
    <div className="cc-field">
      <span className="cc-field__label">{SLOT_LABELS[slot]}</span>
      <div className="cc-row">
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
              aria-pressed={isSelected}
              className={isSelected ? "cc-chip cc-chip--selected" : "cc-chip"}
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
    <div className="cc-page cc-page--narrow">
      <h1>Loadout</h1>

      <Panel className="cc-loadout">
        <LoadoutPreview tint={loadout.tintPrimary} helmetTint={helmetTint} capeTint={capeTint} />

        <div className="cc-stack">
          <Field label="Weapon">
            {(props) => (
              <Select
                {...props}
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
              </Select>
            )}
          </Field>

          <div className="cc-field">
            <span id="tint-primary-label" className="cc-field__label">
              Primary tint
            </span>
            <div role="group" aria-labelledby="tint-primary-label" className="cc-row">
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

          <div className="cc-field">
            <span id="tint-secondary-label" className="cc-field__label">
              Secondary tint
            </span>
            <div role="group" aria-labelledby="tint-secondary-label" className="cc-row">
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
      </Panel>

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

      <div className="cc-row">
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving..." : "Save loadout"}
        </Button>
        {status && <p role="status">{status}</p>}
      </div>
    </div>
  );
}
