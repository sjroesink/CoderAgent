import { eq } from "drizzle-orm";
import type { Db } from "../data/db";
import { globalChannels } from "../data/schema";
import type { GlobalChannel } from "../data/schema";

export class GlobalChannelService {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async getAll(): Promise<GlobalChannel[]> {
    return this.db.query.globalChannels.findMany({
      orderBy: [globalChannels.channelType, globalChannels.name],
    });
  }

  async getEnabled(): Promise<GlobalChannel[]> {
    return this.db
      .select()
      .from(globalChannels)
      .where(eq(globalChannels.isEnabled, true))
      .orderBy(globalChannels.channelType, globalChannels.name);
  }

  async getById(id: number): Promise<GlobalChannel | undefined> {
    return this.db.query.globalChannels.findFirst({
      where: eq(globalChannels.id, id),
    });
  }

  async create(channelType: string, name: string, configurationJson: string): Promise<GlobalChannel> {
    const result = await this.db
      .insert(globalChannels)
      .values({
        channelType,
        name,
        configurationJson,
        isEnabled: true,
      })
      .returning();

    return result[0];
  }

  async update(id: number, name: string, configurationJson: string, isEnabled: boolean): Promise<void> {
    await this.db
      .update(globalChannels)
      .set({
        name,
        configurationJson,
        isEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(globalChannels.id, id));
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(globalChannels).where(eq(globalChannels.id, id));
  }

  async toggleEnabled(id: number): Promise<void> {
    const entity = await this.getById(id);
    if (!entity) {
      throw new Error(`Global channel ${id} not found.`);
    }

    await this.db
      .update(globalChannels)
      .set({
        isEnabled: !entity.isEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(globalChannels.id, id));
  }
}
