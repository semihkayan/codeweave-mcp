import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { IRecordStore } from "../types/interfaces.js";
import type { FunctionRecord } from "../types/index.js";

export class JsonFileRecordStore implements IRecordStore {
  constructor(private cacheDir: string) {}

  async loadAll(): Promise<{ records: FunctionRecord[]; hashes: Map<string, string> }> {
    const records: FunctionRecord[] = [];
    const hashes = new Map<string, string>();

    if (!existsSync(this.cacheDir)) return { records, hashes };

    const files = await readdir(this.cacheDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await readFile(path.join(this.cacheDir, file), "utf-8");
        const data = JSON.parse(content) as {
          filePath: string;
          fileHash: string;
          records: FunctionRecord[];
        };
        records.push(...data.records);
        hashes.set(data.filePath, data.fileHash);
      } catch {
        // Corrupt cache file — skip, will be re-parsed
      }
    }

    return { records, hashes };
  }

  async saveFile(filePath: string, records: FunctionRecord[], hash: string): Promise<void> {
    await this.ensureDir();
    const cacheFile = this.getCacheFileName(filePath);
    await writeFile(
      path.join(this.cacheDir, cacheFile),
      JSON.stringify({ filePath, fileHash: hash, records }, null, 2)
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    const cacheFile = this.getCacheFileName(filePath);
    const fullPath = path.join(this.cacheDir, cacheFile);
    if (existsSync(fullPath)) {
      await unlink(fullPath).catch(() => {});
    }
  }

  async getFileHash(filePath: string): Promise<string | null> {
    const cacheFile = this.getCacheFileName(filePath);
    const fullPath = path.join(this.cacheDir, cacheFile);
    if (!existsSync(fullPath)) return null;
    try {
      const content = await readFile(fullPath, "utf-8");
      const data = JSON.parse(content);
      return data.fileHash || null;
    } catch {
      return null;
    }
  }

  private getCacheFileName(filePath: string): string {
    return createHash("sha256").update(filePath).digest("hex") + ".json";
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }
  }
}
