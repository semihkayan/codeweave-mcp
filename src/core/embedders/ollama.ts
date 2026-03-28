import type { IEmbeddingProvider } from "../../types/interfaces.js";
import { EmbedderError } from "../../types/index.js";

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  public readonly dimensions: number;

  constructor(
    private url: string,
    private model: string,
    dimensions: number,
    private instruction?: string,
  ) {
    this.dimensions = dimensions;
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    // Documents are embedded WITHOUT instruction prefix
    return this._embed(texts);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    // Queries get instruction prefix (Qwen3 format)
    const formatted = this.instruction
      ? `Instruct: ${this.instruction}\nQuery: ${text}`
      : text;
    const [result] = await this._embed([formatted]);
    return result;
  }

  private async _embed(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(`${this.url}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new EmbedderError(
          `Model "${this.model}" not found. Run: ollama pull ${this.model}`
        );
      }
      throw new EmbedderError(`Ollama error: ${response.status}`);
    }

    const data = await response.json() as { embeddings?: number[][] };

    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new EmbedderError("Invalid Ollama response: missing embeddings array");
    }
    if (data.embeddings[0] && data.embeddings[0].length !== this.dimensions) {
      throw new EmbedderError(
        `Dimension mismatch: expected ${this.dimensions}, got ${data.embeddings[0].length}`
      );
    }

    return data.embeddings.map(e => new Float32Array(e));
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.url}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return false;
      const data = await resp.json() as { models?: Array<{ name: string }> };
      return data.models?.some(m => m.name.startsWith(this.model)) ?? false;
    } catch {
      return false;
    }
  }
}
