import { elizaLogger, IAgentRuntime, type UUID } from "@elizaos/core";
import type { Statement } from "better-sqlite3";
import { v4 } from "uuid";

export interface RuntimeWithWallet extends IAgentRuntime {
    walletAdapter?: IWalletAdapter;
}

export interface IWalletAdapter {
    getWalletBalances(
        agentId: UUID
    ): Promise<Record<string, number> | undefined>;
    initSimulatedWallet(agentId: UUID): Promise<void>;
    updateSimulatedWallet(
        agentId: UUID,
        sellAddress: string,
        sellAmount: number,
        buyAddress: string,
        buyAmount: number
    ): Promise<void>;
}

export class WalletAdapter implements IWalletAdapter {
    private db: any;

    constructor(db: any) {
        this.db = db;
    }

    private statements = new Map<string, Statement>();

    private prepareStatement(sql: string): Statement {
        let stmt = this.statements.get(sql);
        if (!stmt) {
            stmt = this.db.prepare(sql);
            this.statements.set(sql, stmt);
        }
        return stmt;
    }

    private withTransaction<T>(operation: () => T): T {
        try {
            this.db.prepare("BEGIN").run();
            const result = operation();
            this.db.prepare("COMMIT").run();
            return result;
        } catch (error) {
            this.db.prepare("ROLLBACK").run();
            throw error;
        }
    }

    private readonly WATCHLIST_STATEMENTS = {
        create: `
            CREATE TABLE IF NOT EXISTS watchlists (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                markets TEXT NOT NULL CHECK(json_valid(markets)),
                created_at INTEGER NOT NULL,
                UNIQUE(room_id)
            )
        `,
        get: "SELECT markets FROM watchlists WHERE room_id = ?",
        upsert: `
            INSERT INTO watchlists (id, room_id, user_id, markets, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(room_id) DO UPDATE SET
                markets = excluded.markets,
                created_at = excluded.created_at
        `,
        delete: "DELETE FROM watchlists WHERE room_id = ?",
    };

    async initSimulatedWallet(agentID: UUID): Promise<void> {
      const sql = `
      INSERT INTO agent_balances (
        agentID,
        "0x03b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee",
        "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
        "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
        "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
        "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
        "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2",
        "0x049210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee",
        "0x05574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
        "0x0319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610",
        "0x070a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac",
        "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
        "0x0c530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007",
        "0x0585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34",
        "0x04878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b",
        "0x0102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b"
      ) VALUES (
        ?, 0, 0, 0, 0, 0, 500000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      )
      ON CONFLICT(agentID) DO NOTHING;
      `;

      this.db.prepare(sql).run(agentID);
  }

  async updateSimulatedWallet(
      agentId: UUID,
      sellAddress: string,
      sellAmount: number,
      buyAddress: string,
      buyAmount: number
  ): Promise<void> {
      const tx = this.db.transaction(() => {
          const checkSql = "SELECT * FROM agent_balances WHERE agentID = ?";
          const existingRow = this.db.prepare(checkSql).get(agentId) as
              | Record<string, any>
              | undefined;

          if (!existingRow) {
              throw new Error(`Agent ${agentId} not found in agent_balances`);
          }
          elizaLogger.error("existingROw:", existingRow)

          if (!(sellAddress in existingRow) || !(buyAddress in existingRow)) {
            elizaLogger.error("!(sellAddress in existingRow)", !(sellAddress in existingRow))
            elizaLogger.error("!(buyAddress in existingRow)", !(buyAddress in existingRow))

              throw new Error(
                  "One or both addresses are not valid columns in agent_balances"
              );
          }

          const checkBalanceSql = `SELECT "${sellAddress}" FROM agent_balances WHERE agentID = ?`;
          const balanceRow = this.db.prepare(checkBalanceSql).get(agentId) as
              | Record<string, number>
              | undefined;

          if (!balanceRow || balanceRow[sellAddress] === undefined) {
              throw new Error(
                  `Could not retrieve balance for ${sellAddress}`
              );
          }

          const currentBalance = balanceRow[sellAddress];

          if (currentBalance < sellAmount) {
              throw new Error(
                  `Insufficient balance: ${currentBalance} available, tried to sell ${sellAmount}`
              );
          }

          const sellSql = `UPDATE agent_balances SET "${sellAddress}" = "${sellAddress}" - ? WHERE agentID = ?`;
          this.db.prepare(sellSql).run(sellAmount, agentId);

          const buySql = `UPDATE agent_balances SET "${buyAddress}" = "${buyAddress}" + ? WHERE agentID = ?`;
          this.db.prepare(buySql).run(buyAmount, agentId);
          console.log("ETAPE updateSimulatedWallet OKKKKKKK");
      });

      tx();
  }

  async getWalletBalances(
      agentId: UUID
  ): Promise<Record<string, number> | undefined> {
      const sql = `SELECT * FROM agent_balances WHERE agentID = ?`;
      const balanceRow = this.db.prepare(sql).get(agentId) as
          | Record<string, number>
          | undefined;
      if (!balanceRow) {
          throw new Error(`No wallet found for agent ${agentId}`);
      }
      delete balanceRow["agentID"];
      return balanceRow;
  }

    async getWatchlist(roomId: UUID): Promise<string[]> {
        try {
            elizaLogger.info(`Fetching watchlist for room ${roomId}...`);

            const stmt = this.prepareStatement(this.WATCHLIST_STATEMENTS.get);
            const result = stmt.get(roomId) as { markets: string } | undefined;

            if (!result) {
                elizaLogger.info("No watchlist found for this room");
                return [];
            }

            const markets = JSON.parse(result.markets);
            elizaLogger.success("Found watchlist:", markets);
            return markets;
        } catch (error) {
            elizaLogger.error("Error getting watchlist:", error);
            return [];
        }
    }

    async upsertWatchlist(entry: {
        room_id: UUID;
        user_id: UUID;
        markets: string[];
    }): Promise<void> {
        try {
            elizaLogger.info("Upserting watchlist...", entry);

            return this.withTransaction(() => {
                const stmt = this.prepareStatement(
                    this.WATCHLIST_STATEMENTS.upsert
                );
                stmt.run(
                    v4(),
                    entry.room_id,
                    entry.user_id,
                    JSON.stringify(entry.markets),
                    Date.now()
                );
                elizaLogger.success("Watchlist saved successfully");
            });
        } catch (error) {
            elizaLogger.error("Error saving watchlist:", error);
            throw error;
        }
    }

    async removeWatchlist(roomId: UUID): Promise<void> {
        try {
            elizaLogger.info(`Removing watchlist for room ${roomId}...`);

            const stmt = this.prepareStatement(
                this.WATCHLIST_STATEMENTS.delete
            );
            stmt.run(roomId);

            elizaLogger.success("Watchlist removed successfully");
        } catch (error) {
            elizaLogger.error("Error removing watchlist:", error);
            throw error;
        }
    }
}
