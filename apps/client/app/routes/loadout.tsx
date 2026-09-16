import { requireSession } from "../auth/requireSession.js";

/** A real placeholder, not a stub route someone forgot to fill in: Phase 8
 *  only needs this route to exist and be `clientLoader`-guarded (plan step
 *  6 names it explicitly alongside lobby/play/stats); its actual
 *  customization UI is Phase 9 ("Customization and Stats UI"). */
export async function clientLoader(): Promise<null> {
  await requireSession();
  return null;
}

export default function Loadout() {
  return <p>Loadout customization is coming in a future update.</p>;
}
