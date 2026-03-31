import { watch, type FSWatcher } from "chokidar";
import path from "node:path";
import ignore from "ignore";
import type { IFileWatcher, Config } from "../../types/interfaces.js";
import { logger } from "../../utils/logger.js";

export class FileWatcher implements IFileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingChanges: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private minIntervalTimer: NodeJS.Timeout | null = null;
  private lastFlushTime: number = 0;
  private flushing: boolean = false;
  private _isRunning: boolean = false;
  private supportedExtensions: string[];
  private ignoreFilter: ReturnType<typeof ignore.default>;

  constructor(
    private config: Config,
    private onChanges: (filePaths: string[]) => Promise<void>,
  ) {
    this.supportedExtensions = Object.values(config.parser.languages).flat();
    this.ignoreFilter = ignore.default().add(config.parser.ignore);
  }

  get isRunning(): boolean { return this._isRunning; }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;

    this.watcher = watch(this.config.projectRoot, {
      ignored: [
        ...this.config.parser.ignore.map(p => `**/${p}`),
        "**/node_modules/**",
        "**/.git/**",
        "**/.code-context/**",
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher.on("change", (fp: string) => this.enqueue(fp));
    this.watcher.on("add", (fp: string) => this.enqueue(fp));
    this.watcher.on("unlink", (fp: string) => this.enqueue(fp));
    this.watcher.on("error", (err: unknown) => logger.warn({ err }, "FileWatcher error (ignored)"));

    logger.info("FileWatcher started");
  }

  stop(): void {
    this._isRunning = false;
    this.watcher?.close();
    this.watcher = null;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.minIntervalTimer) clearTimeout(this.minIntervalTimer);
    this.pendingChanges.clear();
    logger.info("FileWatcher stopped");
  }

  notifyChanges(filePaths: string[]): void {
    for (const fp of filePaths) this.pendingChanges.add(fp);
    this.scheduleFlush();
  }

  // === Private ===

  private enqueue(filePath: string): void {
    if (!this.isSupportedFile(filePath)) return;
    this.pendingChanges.add(filePath);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const timeSinceLastFlush = Date.now() - this.lastFlushTime;
      const minInterval = this.config.watcher.minIntervalMs;

      if (timeSinceLastFlush >= minInterval) {
        this.tryFlush();
      } else {
        const waitMs = minInterval - timeSinceLastFlush;
        if (this.minIntervalTimer) clearTimeout(this.minIntervalTimer);
        this.minIntervalTimer = setTimeout(() => this.tryFlush(), waitMs);
      }
    }, this.config.watcher.debounceMs);
  }

  private async tryFlush(): Promise<void> {
    if (this.flushing) {
      return;
    }

    this.flushing = true;

    try {
      // Atomic swap
      const filesToProcess = Array.from(this.pendingChanges);
      this.pendingChanges.clear();

      if (filesToProcess.length === 0) return;

      this.lastFlushTime = Date.now();
      logger.info({ files: filesToProcess.length }, "FileWatcher flushing changes");
      await this.onChanges(filesToProcess);
    } catch (err) {
      logger.error({ err }, "FileWatcher flush error");
    } finally {
      this.flushing = false;

      if (this.pendingChanges.size > 0) {
        this.scheduleFlush();
      }
    }
  }

  private isSupportedFile(filePath: string): boolean {
    if (!this.supportedExtensions.some(ext => filePath.endsWith(ext))) return false;
    // Check ignore patterns (convert absolute path to project-relative for matching)
    const relPath = path.relative(this.config.projectRoot, filePath);
    if (this.ignoreFilter.ignores(relPath)) return false;
    return true;
  }
}
