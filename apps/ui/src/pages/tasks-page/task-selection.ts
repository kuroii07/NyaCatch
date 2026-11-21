export function canStart(status?: string) {
  return status === "ready" || status === "stopped" || status === "failed";
}
export function canRemove(status?: string) {
  return status !== "pending" && status !== "downloading";
}
export function selectTaskIds(
  selected: number[],
  visible: number[],
  id: number,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  anchor?: number,
): number[] {
  const toggle = modifiers.ctrlKey || modifiers.metaKey;
  if (modifiers.shiftKey && anchor !== undefined && visible.includes(anchor)) {
    const a = visible.indexOf(anchor),
      b = visible.indexOf(id);
    const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1);
    return toggle ? [...new Set([...selected, ...range])] : range;
  }
  return toggle
    ? selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id]
    : [id];
}
