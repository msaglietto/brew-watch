export type ChangeType = "new" | "updated";
export type PackageKind = "formula" | "cask";

export interface ChangeRow {
  id: number;
  name: string;
  kind: PackageKind;
  change_type: ChangeType;
  old_version: string | null;
  new_version: string;
  detected_at: string;
  description: string | null;
  homepage: string | null;
}

/**
 * Keyset cursor over (detected_at, id). Rows emitted in a single snapshot run
 * share one `detected_at`, so `id` breaks ties and the cursor is stable.
 */
export interface ChangeCursor {
  detected_at: string;
  id: number;
}

export interface ChangesPage {
  rows: ChangeRow[];
  nextCursor: ChangeCursor | null;
}

export interface GetChangesOptions {
  limit?: number;
  cursor?: ChangeCursor | null;
}

export async function getRecentChanges(
  db: D1Database,
  changeType: ChangeType,
  kind: PackageKind | "all",
  options: GetChangesOptions = {}
): Promise<ChangesPage> {
  const limit = options.limit ?? 100;
  const cursor = options.cursor ?? null;
  // Fetch one extra row to detect whether another page exists.
  const fetchLimit = limit + 1;

  const stmt =
    cursor === null
      ? kind === "all"
        ? db
            .prepare(
              "SELECT c.id, c.name, c.kind, c.change_type, c.old_version, c.new_version, c.detected_at, p.description, p.homepage FROM changes c LEFT JOIN packages p ON p.name = c.name AND p.kind = c.kind WHERE c.change_type = ? ORDER BY c.detected_at DESC, c.id DESC LIMIT ?"
            )
            .bind(changeType, fetchLimit)
        : db
            .prepare(
              "SELECT c.id, c.name, c.kind, c.change_type, c.old_version, c.new_version, c.detected_at, p.description, p.homepage FROM changes c LEFT JOIN packages p ON p.name = c.name AND p.kind = c.kind WHERE c.change_type = ? AND c.kind = ? ORDER BY c.detected_at DESC, c.id DESC LIMIT ?"
            )
            .bind(changeType, kind, fetchLimit)
      : kind === "all"
        ? db
            .prepare(
              "SELECT c.id, c.name, c.kind, c.change_type, c.old_version, c.new_version, c.detected_at, p.description, p.homepage FROM changes c LEFT JOIN packages p ON p.name = c.name AND p.kind = c.kind WHERE c.change_type = ? AND (c.detected_at < ? OR (c.detected_at = ? AND c.id < ?)) ORDER BY c.detected_at DESC, c.id DESC LIMIT ?"
            )
            .bind(changeType, cursor.detected_at, cursor.detected_at, cursor.id, fetchLimit)
        : db
            .prepare(
              "SELECT c.id, c.name, c.kind, c.change_type, c.old_version, c.new_version, c.detected_at, p.description, p.homepage FROM changes c LEFT JOIN packages p ON p.name = c.name AND p.kind = c.kind WHERE c.change_type = ? AND c.kind = ? AND (c.detected_at < ? OR (c.detected_at = ? AND c.id < ?)) ORDER BY c.detected_at DESC, c.id DESC LIMIT ?"
            )
            .bind(
              changeType,
              kind,
              cursor.detected_at,
              cursor.detected_at,
              cursor.id,
              fetchLimit
            );

  const { results } = await stmt.all<ChangeRow>();
  const hasMore = results.length > limit;
  const rows = hasMore ? results.slice(0, limit) : results;
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last ? { detected_at: last.detected_at, id: last.id } : null;

  return { rows, nextCursor };
}

export function brewUrl(row: ChangeRow): string {
  return row.kind === "formula"
    ? `https://formulae.brew.sh/formula/${row.name}`
    : `https://formulae.brew.sh/cask/${row.name}`;
}
