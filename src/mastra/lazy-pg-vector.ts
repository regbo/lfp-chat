import { PgVector } from "@mastra/pg";

type PgVectorCreateIndexArgs = Parameters<PgVector["createIndex"]>[0];

/**
 * PgVector normally installs its extension from createIndex. Keeping the
 * explicit lazy guard here makes that dependency observable and reliable for
 * databases that are provisioned before their first semantic-memory write.
 */
export class LazyExtensionPgVector extends PgVector {
  private extensionReady?: Promise<void>;

  private ensureVectorExtension() {
    this.extensionReady ??= this.pool
      .query("CREATE EXTENSION IF NOT EXISTS vector")
      .then(() => undefined)
      .catch((error: unknown) => {
        // Allow a later request to recover after a transient database failure.
        this.extensionReady = undefined;
        throw error;
      });
    return this.extensionReady;
  }

  override async createIndex(args: PgVectorCreateIndexArgs): Promise<void> {
    await this.ensureVectorExtension();
    await super.createIndex(args);
  }
}
