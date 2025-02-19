export const sqliteTables = `
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

-- Table: accounts
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "details" TEXT DEFAULT '{}' CHECK(json_valid("details")) -- Ensuring details is a valid JSON field
);

-- Table: memories
CREATE TABLE IF NOT EXISTS "memories" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "embedding" BLOB NOT NULL, -- TODO: EMBEDDING ARRAY, CONVERT TO BEST FORMAT FOR SQLITE-VSS (JSON?)
    "userId" TEXT,
    "roomId" TEXT,
    "agentId" TEXT,
    "unique" INTEGER DEFAULT 1 NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "accounts"("id"),
    FOREIGN KEY ("roomId") REFERENCES "rooms"("id"),
    FOREIGN KEY ("agentId") REFERENCES "accounts"("id")
);

-- Table: goals
CREATE TABLE IF NOT EXISTS "goals" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "name" TEXT,
    "status" TEXT,
    "description" TEXT,
    "roomId" TEXT,
    "objectives" TEXT DEFAULT '[]' NOT NULL CHECK(json_valid("objectives")) -- Ensuring objectives is a valid JSON array
);

-- Table: logs
CREATE TABLE IF NOT EXISTS "logs" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "roomId" TEXT NOT NULL
);

-- Table: agent_balances
CREATE TABLE IF NOT EXISTS "agent_balances" (
    "agentID" TEXT PRIMARY KEY,
    "0x03b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee" INTEGER,
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac" INTEGER,
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7" INTEGER,
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" INTEGER,
    "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49" INTEGER,
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8" INTEGER,
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8" INTEGER,
    "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2" INTEGER,
    "0x049210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee" INTEGER,
    "0x05574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad" INTEGER,
    "0x0319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610" INTEGER,
    "0x070a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac" INTEGER,
    "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a" INTEGER,
    "0x0c530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007" INTEGER,
    "0x0585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34" INTEGER,
    "0x04878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b" INTEGER,
    "0x0102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b" INTEGER
);

-- Table: participants
CREATE TABLE IF NOT EXISTS "participants" (
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "roomId" TEXT,
    "userState" TEXT,
    "id" TEXT PRIMARY KEY,
    "last_message_read" TEXT,
    FOREIGN KEY ("userId") REFERENCES "accounts"("id"),
    FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
);

-- Table: relationships
CREATE TABLE IF NOT EXISTS "relationships" (
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "userA" TEXT NOT NULL,
    "userB" TEXT NOT NULL,
    "status" "text",
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    FOREIGN KEY ("userA") REFERENCES "accounts"("id"),
    FOREIGN KEY ("userB") REFERENCES "accounts"("id"),
    FOREIGN KEY ("userId") REFERENCES "accounts"("id")
);

-- Table: rooms
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: cache
CREATE TABLE IF NOT EXISTS "cache" (
    "key" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "value" TEXT DEFAULT '{}' CHECK(json_valid("value")),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP,
    PRIMARY KEY ("key", "agentId")
);

-- Table: knowledge
CREATE TABLE IF NOT EXISTS "knowledge" (
    "id" TEXT PRIMARY KEY,
    "agentId" TEXT,
    "content" TEXT NOT NULL CHECK(json_valid("content")),
    "embedding" BLOB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "isMain" INTEGER DEFAULT 0,
    "originalId" TEXT,
    "chunkIndex" INTEGER,
    "isShared" INTEGER DEFAULT 0,
    FOREIGN KEY ("agentId") REFERENCES "accounts"("id"),
    FOREIGN KEY ("originalId") REFERENCES "knowledge"("id"),
    CHECK((isShared = 1 AND agentId IS NULL) OR (isShared = 0 AND agentId IS NOT NULL))
);

-- Index: relationships_id_key
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_id_key" ON "relationships" ("id");

-- Index: memories_id_key
CREATE UNIQUE INDEX IF NOT EXISTS "memories_id_key" ON "memories" ("id");

-- Index: participants_id_key
CREATE UNIQUE INDEX IF NOT EXISTS "participants_id_key" ON "participants" ("id");

-- Index: knowledge
CREATE INDEX IF NOT EXISTS "knowledge_agent_key" ON "knowledge" ("agentId");
CREATE INDEX IF NOT EXISTS "knowledge_agent_main_key" ON "knowledge" ("agentId", "isMain");
CREATE INDEX IF NOT EXISTS "knowledge_original_key" ON "knowledge" ("originalId");
CREATE INDEX IF NOT EXISTS "knowledge_content_key" ON "knowledge"
    ((json_extract(content, '$.text')))
    WHERE json_extract(content, '$.text') IS NOT NULL;
CREATE INDEX IF NOT EXISTS "knowledge_created_key" ON "knowledge" ("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "knowledge_shared_key" ON "knowledge" ("isShared");

COMMIT;`;