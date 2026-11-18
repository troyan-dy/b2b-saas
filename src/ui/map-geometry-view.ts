/** Map and panel coordinates are expressed in the original 1920px-wide stage. */
export const stageScale = (width: number): number => width / 1920;

export function wheelMovement(
  deltaX: number,
  deltaY: number,
  mode: number,
  shift: boolean,
  scale: number,
): [number, number] {
  const unit = mode === 1 ? 16 : mode === 2 ? 600 : 1;
  return [(-(shift ? deltaY : deltaX) * unit) / scale, (-(shift ? 0 : deltaY) * unit) / scale];
}

export function clientPanelPosition(
  anchor: { x: number; y: number },
  width: number,
  height: number,
) {
  const left = Math.min(1320 - width, Math.max(20, anchor.x - width / 2));
  const top = Math.min(1004 - height, Math.max(272, anchor.y - height - 20));
  const pointer = Math.max(24, Math.min(width - 24, anchor.x - left));
  return { left, top, pointer };
}
