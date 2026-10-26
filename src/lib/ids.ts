const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids come from URLs and forms. Postgres throws on a malformed uuid, so check before querying. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
