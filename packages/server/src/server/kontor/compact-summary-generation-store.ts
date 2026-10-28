import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { mkdir, open, readFile, rename } from "node:fs/promises";

const agentIdSchema = z.string().uuid();

const compactSummarySectionsSchema = z
  .object({
    task: z.string(),
    decisions: z.string(),
    currentState: z.string(),
    nextStep: z.string(),
  })
  .strict();

const storedGenerationSchema = z
  .object({
    revision: z.number().int().positive(),
    cutoff: z.string().min(1),
    sections: compactSummarySectionsSchema,
    savedAt: z.string().min(1),
  })
  .strict();

export type StoredCompactSummaryGeneration = z.infer<typeof storedGenerationSchema>;

export class CompactSummaryGenerationStore {
  constructor(private readonly dir: string) {}

  private filePath(agentId: string): string {
    const parsed = agentIdSchema.parse(agentId);
    return join(this.dir, `${parsed}.json`);
  }

  async read(agentId: string): Promise<StoredCompactSummaryGeneration | null> {
    try {
      const raw = await readFile(this.filePath(agentId), "utf8");
      return storedGenerationSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async write(agentId: string, record: StoredCompactSummaryGeneration): Promise<void> {
    const parsed = storedGenerationSchema.parse(record);
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const finalPath = this.filePath(agentId);
    const tempPath = `${finalPath}.${randomUUID()}.tmp`;
    const output = await open(tempPath, "wx", 0o600);
    try {
      await output.writeFile(`${JSON.stringify(parsed, null, 2)}\n`);
      await output.sync();
    } finally {
      await output.close();
    }
    await rename(tempPath, finalPath);
  }
}
