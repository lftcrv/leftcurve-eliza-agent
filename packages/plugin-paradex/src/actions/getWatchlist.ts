import {
    Action,
    IAgentRuntime,
    Memory,
    elizaLogger,
    ModelClass,
    generateText,
    composeContext,
    WalletAdapter
} from "@elizaos/core";

const responseTemplate = `
Given the current watchlist state, generate a short response about it without any additional information.
Current watchlist: {{watchlist}}
Is watchlist empty: {{isEmpty}}
`;

// TODO: answer with a text
export const getWatchlistAction: Action = {
    name: "GET_WATCHLIST",
    similes: ["SHOW_WATCHLIST", "LIST_WATCHLIST", "VIEW_WATCHLIST"],
    description: "Display current market watchlist",
    suppressInitialMessage: true,

    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },

    handler: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            elizaLogger.info("Fetching watchlist...");
            const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);
            const watchlist = await walletAdapter.getWatchlist(
                message.roomId
            );

            // Compose state for text generation
            const state = await runtime.composeState(message);
            const context = composeContext({
                state: {
                    ...state,
                    watchlist: watchlist.join(", ") || "none",
                    isEmpty: watchlist.length === 0 ? "true" : "false",
                },
                template: responseTemplate,
            });

            // Generate response text
            const responseText = await generateText({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            return responseText;
        } catch (error) {
            elizaLogger.error("Error getting watchlist:", error);

            const errorMessage: Memory = {
                id: message.id,
                content: {
                    text: "critical error: mainframe access denied, watchlist retrieval failed",
                },
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                createdAt: Date.now(),
            };
            await runtime.messageManager.createMemory(errorMessage);
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Show me my watchlist" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "You watchlist is currently: BTC-USD-PERP, ETH-USD-PERP",
                    watchlist: ["BTC-USD-PERP", "ETH-USD-PERP"],
                },
            },
        ],
    ],
};
