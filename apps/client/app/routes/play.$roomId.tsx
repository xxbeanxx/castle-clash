import { useParams } from "react-router";
import { GameCanvas } from "../ui/GameCanvas.js";

export default function Play() {
  const { roomId } = useParams<{ roomId: string }>();
  return <GameCanvas roomId={roomId ?? "new"} />;
}
