export function isValidEventKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === process.env.EVENT_KEY;
}
