import { Memory, UUID, IAgentRuntime, State } from "@elizaos/core";
import { ParadexState } from "../types";

export const mockRuntime: IAgentRuntime = {
    composeState: async () => ({
        watchlist: ["ETH-USD-PERP"],
    }),
} as any;

export const mockMessage: Memory = {
    userId: "12345678-1234-1234-1234-123456789abc" as UUID,
    agentId: "87654321-4321-4321-4321-cba987654321" as UUID,
    roomId: "abcdef12-3456-7890-abcd-ef1234567890" as UUID,
    content: {
        text: "Show markets",
    },
};
