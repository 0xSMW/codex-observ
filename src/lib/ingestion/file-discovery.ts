import fs from "fs";
import path from "path";

const statCache = new Map<string, fs.Stats | null>();

async function getStatCached(target: string): Promise<fs.Stats | null> {
  if (statCache.has(target)) {
    return statCache.get(target) ?? null;
  }
  try {
    const stat = await fs.promises.stat(target);
    statCache.set(target, stat);
    return stat;
  } catch {
    statCache.set(target, null);
    return null;
  }
}

async function walkDir(
  dir: string,
  onFile: (filePath: string, stat: fs.Stats) => void
): Promise<void> {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, onFile);
        return;
      }
      if (!entry.isFile()) {
        return;
      }
      if (!entry.name.endsWith(".jsonl")) {
        return;
      }
      const stat = await getStatCached(fullPath);
      if (stat) {
        onFile(fullPath, stat);
      }
    })
  );
}

export async function discoverSessionFiles(codexHome: string): Promise<string[]> {
  const root = path.join(codexHome, "sessions");
  const rootStat = await getStatCached(root);
  if (!rootStat || !rootStat.isDirectory()) {
    return [];
  }

  const found: Array<{ path: string; mtimeMs: number }> = [];

  await walkDir(root, (filePath, stat) => {
    found.push({ path: filePath, mtimeMs: stat.mtimeMs });
  });

  found.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return found.map((entry) => entry.path);
}

export async function discoverHistoryFile(codexHome: string): Promise<string | null> {
  const historyPath = path.join(codexHome, "history.jsonl");
  const stat = await getStatCached(historyPath);
  if (!stat || !stat.isFile()) {
    return null;
  }
  return historyPath;
}

export function clearStatCache(): void {
  statCache.clear();
}
