import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    generateObjectDeprecated,
    ModelClass,
    composeContext,
    elizaLogger,
    UUID,
} from "@elizaos/core";
import { ParadexState } from "../types";
import { getMarketsAction } from "./markets";

interface WatchlistOperation {
    market: string;
    type: "add" | "remove";
}

interface WatchlistUpdate {
    operations: WatchlistOperation[];
}

interface WatchlistState extends State, ParadexState {
    marketsInfo?: string;
    currentWatchlist?: string;
    lastMessage?: string;
}
const watchlistTemplate = `Available markets: {{marketsInfo}}
Current watchlist: {{currentWatchlist}}

Analyze ONLY the latest user message to extract requested operations.
Last message: "{{lastMessage}}"

Each operation should either add or remove a market.
Markets must exactly match available markets.

Respond with a JSON markdown block containing ONLY operations from the last message:
\`\`\`json
{
  "operations": [
    {"market": "ETH-USD-PERP", "type": "add"}
  ]
}
\`\`\``;

export const manageWatchlistAction: Action = {
    name: "MANAGE_WATCHLIST",
    similes: ["WATCH_MARKET", "TRACK_MARKET", "UNWATCH_MARKET"],
    description: "Add or remove markets from watchlist",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: WatchlistState
    ) => {
        elizaLogger.info("Starting watchlist management...");
        elizaLogger.info("Message received:", {
            roomId: message.roomId,
            userId: message.userId,
            content: message.content,
        });

        if (!state) {
            elizaLogger.info("Composing state...");
            state = (await runtime.composeState(message)) as WatchlistState;
            elizaLogger.success("State composed");
        }

        // Get current watchlist from database
        elizaLogger.info("Fetching current watchlist...");
        const currentWatchlist = await runtime.databaseAdapter.getWatchlist(
            message.roomId
        );
        elizaLogger.success("Current watchlist:", currentWatchlist);

        state.currentWatchlist = currentWatchlist.join(", ");

        // Get available markets
        elizaLogger.info("Fetching available markets...");
        const availableMarkets = await getMarketsAction.handler(
            runtime,
            message
        );
        if (
            typeof availableMarkets !== "string" ||
            availableMarkets.includes("Failed to fetch")
        ) {
            elizaLogger.error("Failed to fetch available markets");
            return false;
        }

        const marketsList = availableMarkets
            .split("\n")
            .map((m) => m.split(" ")[0]);

        elizaLogger.info("Available markets:", marketsList);
        state.marketsInfo = marketsList.join(", ");
        state.lastMessage = message.content.text;

        // Generate update from user request
        elizaLogger.info("Generating response from user request...");
        const context = composeContext({
            state,
            template: watchlistTemplate,
        });

        elizaLogger.info("Context generated, calling model...");
        const response = (await generateObjectDeprecated({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
        })) as WatchlistUpdate;

        if (!response.operations?.length) {
            elizaLogger.warn("No operations found in response");
            return false;
        }

        elizaLogger.success("Model response:", response);

        // Validate markets exist
        elizaLogger.info("Validating requested markets...");
        const validMarkets = response.operations.filter((op) =>
            marketsList.includes(op.market)
        );

        const validOperations = validMarkets.filter((op) => {
            if (op.type === "add") {
                const alreadyInWatchlist = currentWatchlist.includes(op.market);
                if (alreadyInWatchlist) {
                    elizaLogger.info(
                        `${op.market} is already in watchlist, skipping add operation`
                    );
                    return false;
                }
                return true;
            } else if (op.type === "remove") {
                const isInWatchlist = currentWatchlist.includes(op.market);
                if (!isInWatchlist) {
                    elizaLogger.info(
                        `${op.market} is not in watchlist, skipping remove operation`
                    );
                    return false;
                }
                return true;
            }
            return false;
        });

        if (validOperations.length === 0) {
            elizaLogger.warn("No valid markets found in request");
            return false;
        }

        elizaLogger.success("Valid operations:", validOperations);

        // Update watchlist based on operations
        let newWatchlist = [...currentWatchlist];
        for (const operation of validOperations) {
            if (operation.type === "add") {
                elizaLogger.info(`Adding ${operation.market} to watchlist...`);
                if (!newWatchlist.includes(operation.market)) {
                    newWatchlist.push(operation.market);
                }
            } else if (operation.type === "remove") {
                elizaLogger.info(
                    `Removing ${operation.market} from watchlist...`
                );
                newWatchlist = newWatchlist.filter(
                    (m) => m !== operation.market
                );
            }
        }
        elizaLogger.info("Watchlist update prepared", {
            old_list: currentWatchlist,
            new_list: newWatchlist,
            operations: validOperations,
        });

        // Save updated watchlist to database
        await runtime.databaseAdapter.upsertWatchlist({
            room_id: message.roomId,
            user_id: message.userId,
            markets: newWatchlist,
        });
        elizaLogger.success("New watchlist saved successfully:", newWatchlist);

        return true;
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Watch BTC and ETH perps" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Adding BTC-USD-PERP and ETH-USD-PERP to watchlist",
                },
            },
        ],
    ],
};
