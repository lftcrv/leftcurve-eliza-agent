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

interface WatchlistUpdate {
    markets: string[];
    operation: "add" | "remove";
}

interface WatchlistState extends State, ParadexState {
    marketsInfo?: string;
}

const watchlistTemplate = `Available markets: {{marketsInfo}}
  Extract the following from the user's request:
  - Markets to add/remove from watchlist
  - Operation type (add/remove)
  Respond with a JSON markdown block. Markets must exactly match available markets. Use null if values cannot be determined.
  Example response:
  \`\`\`json
  {
    "markets": ["BTC-USD-PERP", "ETH-USD-PERP"],
    "operation": "add"
  }
  \`\`\`
  {{recentMessages}}`;

export const manageWatchlistAction: Action = {
    name: "MANAGE_WATCHLIST",
    similes: ["WATCH_MARKET", "TRACK_MARKET", "UNWATCH_MARKET"],
    description: "Add or remove markets from watchlist",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text.toLowerCase();
        return (
            text.includes("watch") ||
            text.includes("track") ||
            text.includes("unwatch")
        );
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

        if (!response.markets?.length) {
            elizaLogger.warn("No markets found in response");
            return false;
        }

        elizaLogger.success("Model response:", response);

        // Validate markets exist
        elizaLogger.info("Validating requested markets...");
        const validMarkets = response.markets.filter((m) =>
            marketsList.includes(m)
        );

        if (validMarkets.length === 0) {
            elizaLogger.warn("No valid markets found in request");
            return false;
        }

        elizaLogger.success("Valid markets found:", validMarkets);

        // Update watchlist based on operation
        elizaLogger.info(
            `Updating watchlist with operation: ${response.operation}`
        );
        let newWatchlist: string[];
        if (response.operation === "add") {
            elizaLogger.info("Adding markets to watchlist...");
            newWatchlist = [...new Set([...currentWatchlist, ...validMarkets])];
        } else {
            elizaLogger.info("Removing markets from watchlist...");
            newWatchlist = currentWatchlist.filter(
                (m) => !validMarkets.includes(m)
            );
        }
        elizaLogger.info("Watchlist update prepared", {
            old_list: currentWatchlist,
            new_list: newWatchlist,
            changes: {
                added: response.operation === "add" ? validMarkets : [],
                removed: response.operation === "remove" ? validMarkets : [],
            },
        });

        // Save updated watchlist to database
        elizaLogger.info("Saving updated watchlist to database...");
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
