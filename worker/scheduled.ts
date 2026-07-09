type PackageKind = "formula" | "cask";

interface UpstreamFormula {
  name: string;
  versions: { stable: string | null };
  revision: number;
  desc: string | null;
  homepage: string | null;
}

interface UpstreamCask {
  token: string;
  version: string;
  desc: string | null;
  homepage: string | null;
}

interface NormalizedPackage {
  name: string;
  kind: PackageKind;
  version: string;
  revision: number;
  description: string | null;
  homepage: string | null;
}

interface ExistingPackage {
  name: string;
  kind: PackageKind;
  version: string;
  revision: number;
}

const SOURCES: { kind: PackageKind; url: string }[] = [
  { kind: "formula", url: "https://formulae.brew.sh/api/formula.json" },
  { kind: "cask", url: "https://formulae.brew.sh/api/cask.json" },
];

const BATCH_SIZE = 50;

function key(name: string, kind: PackageKind): string {
  return `${kind}:${name}`;
}

async function fetchSnapshot(kind: PackageKind, url: string): Promise<NormalizedPackage[]> {
  const res = await fetch(url, { headers: { "User-Agent": "brew-watch/1.0" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  const data = (await res.json()) as UpstreamFormula[] | UpstreamCask[];

  if (kind === "formula") {
    return (data as UpstreamFormula[]).map((f) => ({
      name: f.name,
      kind,
      version: f.versions.stable ?? "unknown",
      revision: f.revision ?? 0,
      description: f.desc ?? null,
      homepage: f.homepage ?? null,
    }));
  }

  return (data as UpstreamCask[]).map((c) => ({
    name: c.token,
    kind,
    version: c.version ?? "unknown",
    revision: 0,
    description: c.desc ?? null,
    homepage: c.homepage ?? null,
  }));
}

async function runBatched(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
  }
}

export async function runSnapshotDiff(env: Env): Promise<{ seeded: boolean; new: number; updated: number }> {
  const now = new Date().toISOString();

  const { results: countRows } = await env.DB.prepare("SELECT COUNT(*) as count FROM packages").all<{ count: number }>();
  const isInitialSeed = (countRows[0]?.count ?? 0) === 0;

  const [snapshots, existingRows] = await Promise.all([
    Promise.all(SOURCES.map((s) => fetchSnapshot(s.kind, s.url))),
    env.DB.prepare("SELECT name, kind, version, revision FROM packages").all<ExistingPackage>(),
  ]);

  const allPackages = snapshots.flat();
  const existingMap = new Map<string, ExistingPackage>();
  for (const row of existingRows.results) {
    existingMap.set(key(row.name, row.kind), row);
  }

  const upsertStatements: D1PreparedStatement[] = [];
  const changeStatements: D1PreparedStatement[] = [];
  let newCount = 0;
  let updatedCount = 0;

  for (const pkg of allPackages) {
    const existing = existingMap.get(key(pkg.name, pkg.kind));

    if (!existing) {
      upsertStatements.push(
        env.DB.prepare(
          "INSERT INTO packages (name, kind, version, revision, description, homepage, first_seen_at, last_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(pkg.name, pkg.kind, pkg.version, pkg.revision, pkg.description, pkg.homepage, now, now)
      );
      if (!isInitialSeed) {
        changeStatements.push(
          env.DB.prepare(
            "INSERT INTO changes (name, kind, change_type, old_version, new_version, detected_at) VALUES (?, ?, 'new', NULL, ?, ?)"
          ).bind(pkg.name, pkg.kind, pkg.version, now)
        );
        newCount++;
      }
    } else if (existing.version !== pkg.version || existing.revision !== pkg.revision) {
      upsertStatements.push(
        env.DB.prepare(
          "UPDATE packages SET version = ?, revision = ?, description = ?, homepage = ?, last_updated_at = ? WHERE name = ? AND kind = ?"
        ).bind(pkg.version, pkg.revision, pkg.description, pkg.homepage, now, pkg.name, pkg.kind)
      );
      changeStatements.push(
        env.DB.prepare(
          "INSERT INTO changes (name, kind, change_type, old_version, new_version, detected_at) VALUES (?, ?, 'updated', ?, ?, ?)"
        ).bind(pkg.name, pkg.kind, existing.version, pkg.version, now)
      );
      updatedCount++;
    }
  }

  await runBatched(env, upsertStatements);
  await runBatched(env, changeStatements);

  return { seeded: isInitialSeed, new: newCount, updated: updatedCount };
}
