export * from "./sqliteTables.ts";
export * from "./sqlite_vec.ts";

import { DatabaseAdapter, IDatabaseCacheAdapter } from "@ai16z/eliza";
import {
    Account,
    Actor,
    GoalStatus,
    Participant,
    type Goal,
    type Memory,
    type Relationship,
    type UUID,
} from "@ai16z/eliza";
import { Database } from "better-sqlite3";
import { v4 } from "uuid";
import { load } from "./sqlite_vec.ts";
import { sqliteTables } from "./sqliteTables.ts";

export class SqliteDatabaseAdapter
    extends DatabaseAdapter<Database>
    implements IDatabaseCacheAdapter
{
    async getRoom(roomId: UUID): Promise<UUID | null> {
        const sql = "SELECT id FROM rooms WHERE id = ?";
        const room = this.db.prepare(sql).get(roomId) as
            | { id: string }
            | undefined;
        return room ? (room.id as UUID) : null;
    }

    async getParticipantsForAccount(userId: UUID): Promise<Participant[]> {
        const sql = `
      SELECT p.id, p.userId, p.roomId, p.last_message_read
      FROM participants p
      WHERE p.userId = ?
    `;
        const rows = this.db.prepare(sql).all(userId) as Participant[];
        return rows;
    }

    async getParticipantsForRoom(roomId: UUID): Promise<UUID[]> {
        const sql = "SELECT userId FROM participants WHERE roomId = ?";
        const rows = this.db.prepare(sql).all(roomId) as { userId: string }[];
        return rows.map((row) => row.userId as UUID);
    }

    async getParticipantUserState(
        roomId: UUID,
        userId: UUID
    ): Promise<"FOLLOWED" | "MUTED" | null> {
        const stmt = this.db.prepare(
            "SELECT userState FROM participants WHERE roomId = ? AND userId = ?"
        );
        const res = stmt.get(roomId, userId) as
            | { userState: "FOLLOWED" | "MUTED" | null }
            | undefined;
        return res?.userState ?? null;
    }

    async setParticipantUserState(
        roomId: UUID,
        userId: UUID,
        state: "FOLLOWED" | "MUTED" | null
    ): Promise<void> {
        const stmt = this.db.prepare(
            "UPDATE participants SET userState = ? WHERE roomId = ? AND userId = ?"
        );
        stmt.run(state, roomId, userId);
    }

    constructor(db: Database) {
        super();
        this.db = db;
        load(db);
    }

    async init() {
        this.db.exec(sqliteTables);
    }

    async close() {
        this.db.close();
    }

    async initSimulatedWallet(agentID: UUID): Promise<void> {
        const sql = `
            INSERT INTO agent_balances (
                agentID,
                "0x3b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee",
                "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
                "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
                "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
                "0x42b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2",
                "0x49210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee",
                "0x5574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
                "0x319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610",
                "0x70a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac",
                "0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
                "0xc530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007",
                "0x585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34",
                "0x4878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b",
                "0x102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b"
            ) VALUES (
                ?, -- agentID
                500, 0, 1.64, 150, 1000, 0, 7500, 5, 0, 0, 0, 0, 0, 0, 400, 600, 250
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

            if (!(sellAddress in existingRow) || !(buyAddress in existingRow)) {
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

    async getAccountById(userId: UUID): Promise<Account | null> {
        const sql = "SELECT * FROM accounts WHERE id = ?";
        const account = this.db.prepare(sql).get(userId) as Account;
        if (!account) return null;
        if (account) {
            if (typeof account.details === "string") {
                account.details = JSON.parse(
                    account.details as unknown as string
                );
            }
        }
        return account;
    }

    async createAccount(account: Account): Promise<boolean> {
        try {
            const sql =
                "INSERT INTO accounts (id, name, username, email, avatarUrl, details) VALUES (?, ?, ?, ?, ?, ?)";
            this.db
                .prepare(sql)
                .run(
                    account.id ?? v4(),
                    account.name,
                    account.username,
                    account.email,
                    account.avatarUrl,
                    JSON.stringify(account.details)
                );
            return true;
        } catch (error) {
            console.log("Error creating account", error);
            return false;
        }
    }

    async getActorDetails(params: { roomId: UUID }): Promise<Actor[]> {
        const sql = `
      SELECT a.id, a.name, a.username, a.details
      FROM participants p
      LEFT JOIN accounts a ON p.userId = a.id
      WHERE p.roomId = ?
    `;
        const rows = this.db
            .prepare(sql)
            .all(params.roomId) as (Actor | null)[];

        return rows
            .map((row) => {
                if (row === null) {
                    return null;
                }
                return {
                    ...row,
                    details:
                        typeof row.details === "string"
                            ? JSON.parse(row.details)
                            : row.details,
                };
            })
            .filter((row): row is Actor => row !== null);
    }

    async getMemoriesByRoomIds(params: {
        agentId: UUID;
        roomIds: UUID[];
        tableName: string;
    }): Promise<Memory[]> {
        if (!params.tableName) {
            // default to messages
            params.tableName = "messages";
        }
        const placeholders = params.roomIds.map(() => "?").join(", ");
        const sql = `SELECT * FROM memories WHERE type = ? AND agentId = ? AND roomId IN (${placeholders})`;
        const queryParams = [
            params.tableName,
            params.agentId,
            ...params.roomIds,
        ];

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...queryParams) as (Memory & {
            content: string;
        })[];

        return rows.map((row) => ({
            ...row,
            content: JSON.parse(row.content),
        }));
    }

    async getMemoryById(memoryId: UUID): Promise<Memory | null> {
        const sql = "SELECT * FROM memories WHERE id = ?";
        const stmt = this.db.prepare(sql);
        stmt.bind([memoryId]);
        const memory = stmt.get() as Memory | undefined;

        if (memory) {
            return {
                ...memory,
                content: JSON.parse(memory.content as unknown as string),
            };
        }

        return null;
    }

    async createMemory(memory: Memory, tableName: string): Promise<void> {
        // Delete any existing memory with the same ID first
        // const deleteSql = `DELETE FROM memories WHERE id = ? AND type = ?`;
        // this.db.prepare(deleteSql).run(memory.id, tableName);

        let isUnique = true;

        if (memory.embedding) {
            // Check if a similar memory already exists
            const similarMemories = await this.searchMemoriesByEmbedding(
                memory.embedding,
                {
                    tableName,
                    agentId: memory.agentId,
                    roomId: memory.roomId,
                    match_threshold: 0.95, // 5% similarity threshold
                    count: 1,
                }
            );

            isUnique = similarMemories.length === 0;
        }

        const content = JSON.stringify(memory.content);
        const createdAt = memory.createdAt ?? Date.now();

        // Insert the memory with the appropriate 'unique' value
        const sql = `INSERT OR REPLACE INTO memories (id, type, content, embedding, userId, roomId, agentId, \`unique\`, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        this.db.prepare(sql).run(
            memory.id ?? v4(),
            tableName,
            content,
            new Float32Array(memory.embedding!), // Store as Float32Array
            memory.userId,
            memory.roomId,
            memory.agentId,
            isUnique ? 1 : 0,
            createdAt
        );
    }

    async searchMemories(params: {
        tableName: string;
        roomId: UUID;
        agentId?: UUID;
        embedding: number[];
        match_threshold: number;
        match_count: number;
        unique: boolean;
    }): Promise<Memory[]> {
        // Build the query and parameters carefully
        const queryParams = [
            new Float32Array(params.embedding), // Ensure embedding is Float32Array
            params.tableName,
            params.roomId,
        ];

        let sql = `
            SELECT *, vec_distance_L2(embedding, ?) AS similarity
            FROM memories
            WHERE type = ?
            AND roomId = ?`;

        if (params.unique) {
            sql += " AND `unique` = 1";
        }

        if (params.agentId) {
            sql += " AND agentId = ?";
            queryParams.push(params.agentId);
        }
        sql += ` ORDER BY similarity ASC LIMIT ?`; // ASC for lower distance
        queryParams.push(params.match_count.toString()); // Convert number to string

        // Execute the prepared statement with the correct number of parameters
        const memories = this.db.prepare(sql).all(...queryParams) as (Memory & {
            similarity: number;
        })[];

        return memories.map((memory) => ({
            ...memory,
            createdAt:
                typeof memory.createdAt === "string"
                    ? Date.parse(memory.createdAt as string)
                    : memory.createdAt,
            content: JSON.parse(memory.content as unknown as string),
        }));
    }

    async searchMemoriesByEmbedding(
        embedding: number[],
        params: {
            match_threshold?: number;
            count?: number;
            roomId?: UUID;
            agentId: UUID;
            unique?: boolean;
            tableName: string;
        }
    ): Promise<Memory[]> {
        const queryParams = [
            // JSON.stringify(embedding),
            new Float32Array(embedding),
            params.tableName,
            params.agentId,
        ];

        let sql = `
      SELECT *, vec_distance_L2(embedding, ?) AS similarity
      FROM memories
      WHERE embedding IS NOT NULL AND type = ? AND agentId = ?`;

        if (params.unique) {
            sql += " AND `unique` = 1";
        }

        if (params.roomId) {
            sql += " AND roomId = ?";
            queryParams.push(params.roomId);
        }
        sql += ` ORDER BY similarity DESC`;

        if (params.count) {
            sql += " LIMIT ?";
            queryParams.push(params.count.toString());
        }

        const memories = this.db.prepare(sql).all(...queryParams) as (Memory & {
            similarity: number;
        })[];
        return memories.map((memory) => ({
            ...memory,
            createdAt:
                typeof memory.createdAt === "string"
                    ? Date.parse(memory.createdAt as string)
                    : memory.createdAt,
            content: JSON.parse(memory.content as unknown as string),
        }));
    }

    async getCachedEmbeddings(opts: {
        query_table_name: string;
        query_threshold: number;
        query_input: string;
        query_field_name: string;
        query_field_sub_name: string;
        query_match_count: number;
    }): Promise<{ embedding: number[]; levenshtein_score: number }[]> {
        // First get content text and calculate Levenshtein distance
        const sql = `
            WITH content_text AS (
                SELECT
                    embedding,
                    json_extract(
                        json(content),
                        '$.' || ? || '.' || ?
                    ) as content_text
                FROM memories
                WHERE type = ?
                AND json_extract(
                    json(content),
                    '$.' || ? || '.' || ?
                ) IS NOT NULL
            )
            SELECT
                embedding,
                length(?) + length(content_text) - (
                    length(?) + length(content_text) - (
                        length(replace(lower(?), lower(content_text), '')) +
                        length(replace(lower(content_text), lower(?), ''))
                    ) / 2
                ) as levenshtein_score
            FROM content_text
            ORDER BY levenshtein_score ASC
            LIMIT ?
        `;

        const rows = this.db
            .prepare(sql)
            .all(
                opts.query_field_name,
                opts.query_field_sub_name,
                opts.query_table_name,
                opts.query_field_name,
                opts.query_field_sub_name,
                opts.query_input,
                opts.query_input,
                opts.query_input,
                opts.query_input,
                opts.query_match_count
            ) as { embedding: Buffer; levenshtein_score: number }[];

        return rows.map((row) => ({
            embedding: Array.from(new Float32Array(row.embedding as Buffer)),
            levenshtein_score: row.levenshtein_score,
        }));
    }

    async updateGoalStatus(params: {
        goalId: UUID;
        status: GoalStatus;
    }): Promise<void> {
        const sql = "UPDATE goals SET status = ? WHERE id = ?";
        this.db.prepare(sql).run(params.status, params.goalId);
    }

    async log(params: {
        body: { [key: string]: unknown };
        userId: UUID;
        roomId: UUID;
        type: string;
    }): Promise<void> {
        const sql =
            "INSERT INTO logs (body, userId, roomId, type) VALUES (?, ?, ?, ?)";
        this.db
            .prepare(sql)
            .run(
                JSON.stringify(params.body),
                params.userId,
                params.roomId,
                params.type
            );
    }

    async getMemories(params: {
        roomId: UUID;
        count?: number;
        unique?: boolean;
        tableName: string;
        agentId: UUID;
        start?: number;
        end?: number;
    }): Promise<Memory[]> {
        if (!params.tableName) {
            throw new Error("tableName is required");
        }
        if (!params.roomId) {
            throw new Error("roomId is required");
        }
        let sql = `SELECT * FROM memories WHERE type = ? AND agentId = ? AND roomId = ?`;

        const queryParams = [
            params.tableName,
            params.agentId,
            params.roomId,
        ] as any[];

        if (params.unique) {
            sql += " AND `unique` = 1";
        }

        if (params.start) {
            sql += ` AND createdAt >= ?`;
            queryParams.push(params.start);
        }

        if (params.end) {
            sql += ` AND createdAt <= ?`;
            queryParams.push(params.end);
        }

        sql += " ORDER BY createdAt DESC";

        if (params.count) {
            sql += " LIMIT ?";
            queryParams.push(params.count);
        }

        const memories = this.db.prepare(sql).all(...queryParams) as Memory[];

        return memories.map((memory) => ({
            ...memory,
            createdAt:
                typeof memory.createdAt === "string"
                    ? Date.parse(memory.createdAt as string)
                    : memory.createdAt,
            content: JSON.parse(memory.content as unknown as string),
        }));
    }

    async removeMemory(memoryId: UUID, tableName: string): Promise<void> {
        const sql = `DELETE FROM memories WHERE type = ? AND id = ?`;
        this.db.prepare(sql).run(tableName, memoryId);
    }

    async removeAllMemories(roomId: UUID, tableName: string): Promise<void> {
        const sql = `DELETE FROM memories WHERE type = ? AND roomId = ?`;
        this.db.prepare(sql).run(tableName, roomId);
    }

    async countMemories(
        roomId: UUID,
        unique = true,
        tableName = ""
    ): Promise<number> {
        if (!tableName) {
            throw new Error("tableName is required");
        }

        let sql = `SELECT COUNT(*) as count FROM memories WHERE type = ? AND roomId = ?`;
        const queryParams = [tableName, roomId] as string[];

        if (unique) {
            sql += " AND `unique` = 1";
        }

        return (this.db.prepare(sql).get(...queryParams) as { count: number })
            .count;
    }

    async getGoals(params: {
        roomId: UUID;
        userId?: UUID | null;
        onlyInProgress?: boolean;
        count?: number;
    }): Promise<Goal[]> {
        let sql = "SELECT * FROM goals WHERE roomId = ?";
        const queryParams = [params.roomId];

        if (params.userId) {
            sql += " AND userId = ?";
            queryParams.push(params.userId);
        }

        if (params.onlyInProgress) {
            sql += " AND status = 'IN_PROGRESS'";
        }

        if (params.count) {
            sql += " LIMIT ?";
            // @ts-expect-error - queryParams is an array of strings
            queryParams.push(params.count.toString());
        }

        const goals = this.db.prepare(sql).all(...queryParams) as Goal[];
        return goals.map((goal) => ({
            ...goal,
            objectives:
                typeof goal.objectives === "string"
                    ? JSON.parse(goal.objectives)
                    : goal.objectives,
        }));
    }

    async updateGoal(goal: Goal): Promise<void> {
        const sql =
            "UPDATE goals SET name = ?, status = ?, objectives = ? WHERE id = ?";
        this.db
            .prepare(sql)
            .run(
                goal.name,
                goal.status,
                JSON.stringify(goal.objectives),
                goal.id
            );
    }

    async createGoal(goal: Goal): Promise<void> {
        const sql =
            "INSERT INTO goals (id, roomId, userId, name, status, objectives) VALUES (?, ?, ?, ?, ?, ?)";
        this.db
            .prepare(sql)
            .run(
                goal.id ?? v4(),
                goal.roomId,
                goal.userId,
                goal.name,
                goal.status,
                JSON.stringify(goal.objectives)
            );
    }

    async removeGoal(goalId: UUID): Promise<void> {
        const sql = "DELETE FROM goals WHERE id = ?";
        this.db.prepare(sql).run(goalId);
    }

    async removeAllGoals(roomId: UUID): Promise<void> {
        const sql = "DELETE FROM goals WHERE roomId = ?";
        this.db.prepare(sql).run(roomId);
    }

    async createRoom(roomId?: UUID): Promise<UUID> {
        roomId = roomId || (v4() as UUID);
        try {
            const sql = "INSERT INTO rooms (id) VALUES (?)";
            this.db.prepare(sql).run(roomId ?? (v4() as UUID));
        } catch (error) {
            console.log("Error creating room", error);
        }
        return roomId as UUID;
    }

    async removeRoom(roomId: UUID): Promise<void> {
        const sql = "DELETE FROM rooms WHERE id = ?";
        this.db.prepare(sql).run(roomId);
    }

    async getRoomsForParticipant(userId: UUID): Promise<UUID[]> {
        const sql = "SELECT roomId FROM participants WHERE userId = ?";
        const rows = this.db.prepare(sql).all(userId) as { roomId: string }[];
        return rows.map((row) => row.roomId as UUID);
    }

    async getRoomsForParticipants(userIds: UUID[]): Promise<UUID[]> {
        // Assuming userIds is an array of UUID strings, prepare a list of placeholders
        const placeholders = userIds.map(() => "?").join(", ");
        // Construct the SQL query with the correct number of placeholders
        const sql = `SELECT DISTINCT roomId FROM participants WHERE userId IN (${placeholders})`;
        // Execute the query with the userIds array spread into arguments
        const rows = this.db.prepare(sql).all(...userIds) as {
            roomId: string;
        }[];
        // Map and return the roomId values as UUIDs
        return rows.map((row) => row.roomId as UUID);
    }

    async addParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        try {
            const sql =
                "INSERT INTO participants (id, userId, roomId) VALUES (?, ?, ?)";
            this.db.prepare(sql).run(v4(), userId, roomId);
            return true;
        } catch (error) {
            console.log("Error adding participant", error);
            return false;
        }
    }

    async removeParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        try {
            const sql =
                "DELETE FROM participants WHERE userId = ? AND roomId = ?";
            this.db.prepare(sql).run(userId, roomId);
            return true;
        } catch (error) {
            console.log("Error removing participant", error);
            return false;
        }
    }

    async createRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<boolean> {
        if (!params.userA || !params.userB) {
            throw new Error("userA and userB are required");
        }
        const sql =
            "INSERT INTO relationships (id, userA, userB, userId) VALUES (?, ?, ?, ?)";
        this.db
            .prepare(sql)
            .run(v4(), params.userA, params.userB, params.userA);
        return true;
    }

    async getRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<Relationship | null> {
        const sql =
            "SELECT * FROM relationships WHERE (userA = ? AND userB = ?) OR (userA = ? AND userB = ?)";
        return (
            (this.db
                .prepare(sql)
                .get(
                    params.userA,
                    params.userB,
                    params.userB,
                    params.userA
                ) as Relationship) || null
        );
    }

    async getRelationships(params: { userId: UUID }): Promise<Relationship[]> {
        const sql =
            "SELECT * FROM relationships WHERE (userA = ? OR userB = ?)";
        return this.db
            .prepare(sql)
            .all(params.userId, params.userId) as Relationship[];
    }

    async getCache(params: {
        key: string;
        agentId: UUID;
    }): Promise<string | undefined> {
        const sql = "SELECT value FROM cache WHERE (key = ? AND agentId = ?)";
        const cached = this.db
            .prepare<[string, UUID], { value: string }>(sql)
            .get(params.key, params.agentId);

        return cached?.value ?? undefined;
    }

    async setCache(params: {
        key: string;
        agentId: UUID;
        value: string;
    }): Promise<boolean> {
        const sql =
            "INSERT OR REPLACE INTO cache (key, agentId, value, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)";
        this.db.prepare(sql).run(params.key, params.agentId, params.value);
        return true;
    }

    async deleteCache(params: {
        key: string;
        agentId: UUID;
    }): Promise<boolean> {
        try {
            const sql = "DELETE FROM cache WHERE key = ? AND agentId = ?";
            this.db.prepare(sql).run(params.key, params.agentId);
            return true;
        } catch (error) {
            console.log("Error removing cache", error);
            return false;
        }
    }
}
