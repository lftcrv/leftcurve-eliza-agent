import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    WalletAdapter,
} from "@elizaos/core";
import { ParadexState } from "../types";

export const watchlistProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State & ParadexState
    ) => {
        try {
            // Fetch watchlist from database
            const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);
            const watchlist = await walletAdapter.getWatchlist(
                message.roomId
            );

            // Update state if provided
            if (state) {
                state.watchlist = watchlist;
            }

            // Format response
            if (watchlist.length === 0) {
                return "Your watchlist is currently empty.";
            }

            return `Your current watchlist contains these markets:\n${watchlist.join("\n")}`;
        } catch (error) {
            elizaLogger.error("Watchlist Provider error:", error);
            return "Unable to fetch watchlist. Please try again later.";
        }
    },
};
