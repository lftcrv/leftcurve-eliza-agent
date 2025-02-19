import { elizaLogger, IAgentRuntime, Memory } from "@elizaos/core";
import { Action, State } from "../../../core/src/types";

export const clearTradeHistoryAction: Action = {
    name: "CLEAR_TRADE_HISTORY",
    description: "Clear all trade history from memory",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State
    ): Promise<boolean> => {
        try {
            await runtime.knowledgeManager.removeAllMemories(state.roomId);
            elizaLogger.log("Trade history cleared successfully");
            return true;
        } catch (error) {
            elizaLogger.error("Error clearing trade history:", error);
            return false;
        }
    },
    similes: [],
    examples: [],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
};