import { useEffect } from "react";
import { useCanvas, useCollab } from "../hooks";

export default function CollaborationCursors() {
  const {
    canvas: { screenSize },
    coords: { toScreenSpace },
    pointer,
  } = useCanvas();
  const { emitAwareness, identity, participants, remoteCursors } = useCollab();
  const pointerX = pointer.spaces.diagram.x;
  const pointerY = pointer.spaces.diagram.y;

  useEffect(() => {
    if (!pointer.active) return;
    emitAwareness({ x: pointerX, y: pointerY });
  }, [emitAwareness, pointer.active, pointerX, pointerY]);

  return Object.entries(remoteCursors).map(([clientId, cursor]) => {
    const participant = participants.find((item) => item.clientId === clientId);
    if (!participant || clientId === identity.clientId) return null;

    const screenPosition = toScreenSpace(cursor);
    const isVisible =
      Number.isFinite(screenPosition.x) &&
      Number.isFinite(screenPosition.y) &&
      screenPosition.x >= 0 &&
      screenPosition.x <= screenSize.x &&
      screenPosition.y >= 0 &&
      screenPosition.y <= screenSize.y;

    if (!isVisible) return null;

    return (
      <div
        key={clientId}
        className="pointer-events-none absolute z-50"
        style={{
          left: screenPosition.x,
          top: screenPosition.y,
          color: participant.color,
        }}
      >
        <i className="bi bi-cursor-fill text-lg" />
        <span
          className="ml-1 rounded px-1.5 py-0.5 text-xs text-white"
          style={{ backgroundColor: participant.color }}
        >
          {participant.displayName}
        </span>
      </div>
    );
  });
}
