/**
 * The room the robot cleans right now on the 2D plan: a soft accent tint plus a dashed
 * outline, so it never reads as the user's selection (solid ring + gradient fill). The
 * gentle pulse stops under `prefers-reduced-motion` (robotsStyles).
 */
export function LiveRoomLayer({ room, unit }: { room?: { id: number; d: string }; unit: number }) {
  if (!room) return null;
  return (
    <g className="rv-live" data-testid={`robots-map-live-${room.id}`}>
      <path className="rv-live-fill" d={room.d} />
      <path
        className="rv-live-line"
        d={room.d}
        strokeWidth={unit * 0.5}
        strokeDasharray={`${(unit * 1.6).toFixed(2)} ${(unit * 1.1).toFixed(2)}`}
      />
    </g>
  );
}
