import { useLocation, useParams } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import { privatePageMeta } from "../meta.js";
import { GameCanvas } from "../ui/GameCanvas.js";

export const meta = () => privatePageMeta("Match");

export async function clientLoader({ request }: { request: Request }): Promise<null> {
  await requireSession(request);
  return null;
}

export default function Play() {
  const { roomId } = useParams<{ roomId: string }>();
  // Keyed by the router's own location: `GameCanvas` swaps the URL to the real room id with
  // `history.replaceState` (invisible to the router, which still says "new"), so a navigation from
  // one `/play/new?...` to another (the tutorial's "Skip" going on to practice) changes no route
  // param and would never re-run its join effect. A fresh key per navigation remounts it instead.
  const location = useLocation();
  return <GameCanvas key={location.key} roomId={roomId ?? "new"} />;
}
