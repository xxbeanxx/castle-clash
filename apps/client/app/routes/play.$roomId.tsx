import { useParams } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import { privatePageMeta } from "../meta.js";
import { GameCanvas } from "../ui/GameCanvas.js";

export const meta = () => privatePageMeta("Match");

export async function clientLoader(): Promise<null> {
  await requireSession();
  return null;
}

export default function Play() {
  const { roomId } = useParams<{ roomId: string }>();
  return <GameCanvas roomId={roomId ?? "new"} />;
}
