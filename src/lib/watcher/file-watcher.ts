import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { debounce } from './debounce';
import type { FileKind, WatcherStatus } from './events';

export interface FileWatchEvent {
  path: string;
  kind: FileKind;
  eventType: 'change' | 'rename';
  ts: number;
}

export interface FileWatcherOptions {
  codexHome?: string;
  onEvent: (event: FileWatchEvent) => void;
  onError?: (error: string) => void;
}

interface WatchTarget {
  basePath: string;
  kind: FileKind;
  recursive: boolean;
}

const SESSION_DEPTH = 3;

function resolveCodexHome(codexHome?: string): string {
  return codexHome ?? path.join(os.homedir(), '.codex');
}

function isRecursiveSupported(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32';
}

async function listDirectories(root: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    results.push(current.dir);

    if (current.depth >= maxDepth) {
      continue;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      queue.push({
        dir: path.join(current.dir, entry.name),
        depth: current.depth + 1,
      });
    }
  }

  return results;
}

export class FileWatcher {
  private codexHome: string;
  private watchers = new Map<string, fs.FSWatcher>();
  private targets = new Map<string, WatchTarget>();
  private errors: string[] = [];
  private lastEvent: Date | null = null;
  private running = false;
  private refreshSessions: () => void;

  constructor(private options: FileWatcherOptions) {
    this.codexHome = resolveCodexHome(options.codexHome);
    this.refreshSessions = debounce(() => {
      void this.refreshSessionWatches();
    }, 250);
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.setupCoreWatches();
    void this.refreshSessionWatches();
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.targets.clear();
    this.running = false;
  }

  getStatus(): WatcherStatus {
    return {
      running: this.running,
      watchedPaths: Array.from(this.watchers.keys()),
      lastEvent: this.lastEvent,
      errors: [...this.errors],
    };
  }

  private recordError(error: string): void {
    this.errors.push(error);
    if (this.errors.length > 25) {
      this.errors.shift();
    }
    if (this.options.onError) {
      this.options.onError(error);
    }
  }

  private setupCoreWatches(): void {
    this.watchDirectory(this.codexHome, 'config', false);

    const sessionsDir = path.join(this.codexHome, 'sessions');
    if (isRecursiveSupported()) {
      this.watchDirectory(sessionsDir, 'sessions', true);
    } else {
      this.watchDirectory(sessionsDir, 'sessions', false);
    }

    const logDir = path.join(this.codexHome, 'log');
    this.watchDirectory(logDir, 'log', false);

    const historyFile = path.join(this.codexHome, 'history.jsonl');
    this.watchFile(historyFile, 'history');
  }

  private watchDirectory(dirPath: string, kind: FileKind, recursive: boolean): void {
    if (this.watchers.has(dirPath)) {
      return;
    }

    if (!fs.existsSync(dirPath)) {
      return;
    }

    try {
      const watcher = fs.watch(
        dirPath,
        { recursive },
        (eventType, filename) => {
          this.handleWatchEvent(kind, dirPath, eventType, filename);
        }
      );

      watcher.on('error', (err) => {
        this.recordError(`Watcher error on ${dirPath}: ${err.message}`);
      });

      this.watchers.set(dirPath, watcher);
      this.targets.set(dirPath, { basePath: dirPath, kind, recursive });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError(`Failed to watch ${dirPath}: ${message}`);
    }
  }

  private watchFile(filePath: string, kind: FileKind): void {
    if (this.watchers.has(filePath)) {
      return;
    }

    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const watcher = fs.watch(filePath, (eventType, filename) => {
        this.handleWatchEvent(kind, filePath, eventType, filename);
      });

      watcher.on('error', (err) => {
        this.recordError(`Watcher error on ${filePath}: ${err.message}`);
      });

      this.watchers.set(filePath, watcher);
      this.targets.set(filePath, { basePath: filePath, kind, recursive: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError(`Failed to watch ${filePath}: ${message}`);
    }
  }

  private handleWatchEvent(
    kind: FileKind,
    basePath: string,
    eventType: string,
    filename?: string | Buffer | null
  ): void {
    const resolvedType = eventType === 'rename' ? 'rename' : 'change';
    const resolvedPath = this.resolveEventPath(basePath, filename);

    this.lastEvent = new Date();

    this.options.onEvent({
      path: resolvedPath,
      kind,
      eventType: resolvedType,
      ts: Date.now(),
    });

    if (kind === 'sessions' || kind === 'config') {
      if (resolvedType === 'rename') {
        this.refreshSessions();
      }
    }

    if (kind === 'log' && resolvedType === 'rename') {
      const logDir = path.join(this.codexHome, 'log');
      if (basePath === logDir) {
        const logFile = path.join(logDir, 'codex-tui.log');
        this.watchFile(logFile, 'log');
      }
    }

    if (kind === 'history' && resolvedType === 'rename') {
      this.watchFile(basePath, 'history');
    }
  }

  private resolveEventPath(basePath: string, filename?: string | Buffer | null): string {
    if (!filename) {
      return basePath;
    }

    const name = Buffer.isBuffer(filename) ? filename.toString('utf8') : filename;
    if (!name) {
      return basePath;
    }

    if (path.isAbsolute(name)) {
      return name;
    }

    return path.join(basePath, name);
  }

  private async refreshSessionWatches(): Promise<void> {
    const sessionsDir = path.join(this.codexHome, 'sessions');

    if (!fs.existsSync(sessionsDir)) {
      return;
    }

    if (isRecursiveSupported()) {
      return;
    }

    let directories: string[] = [];
    try {
      directories = await listDirectories(sessionsDir, SESSION_DEPTH);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError(`Failed to scan sessions directories: ${message}`);
      return;
    }

    for (const dir of directories) {
      if (!this.watchers.has(dir)) {
        this.watchDirectory(dir, 'sessions', false);
      }
    }
  }
}
