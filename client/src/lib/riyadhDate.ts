const RIYADH_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export type RiyadhDateInput = Date | string | number;

export function getRiyadhDateKey(value: RiyadhDateInput = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const shifted = new Date(date.getTime() + RIYADH_UTC_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getRiyadhTodayKey() {
  return getRiyadhDateKey(Date.now());
}
