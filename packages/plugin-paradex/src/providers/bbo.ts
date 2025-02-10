import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    WalletAdapter,
} from "@elizaos/core";
import { ParadexState } from "../types";

interface BBOResponse {
    ask: string;
    ask_size: string;
    bid: string;
    bid_size: string;
    market: string;
}

export const bboProvider: Provider = {
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

            // Initialize market metrics if not exists in state
            const marketMetrics = state?.marketMetrics || {};
            const results = [];

            // Process each market from the watchlist
            for (const market of watchlist) {
                try {
                    const response = await fetch(
                        `https://api.testnet.paradex.trade/v1/bbo/${market}`
                    );

                    if (!response.ok) {
                        elizaLogger.warn(
                            `Failed to fetch BBO for market ${market}: ${response.statusText}`
                        );
                        continue;
                    }

                    const data: BBOResponse = await response.json();
                    const lastBid = parseFloat(data.bid);
                    const lastAsk = parseFloat(data.ask);
                    const spread = lastAsk - lastBid;
                    const spreadPercentage = (spread / lastBid) * 100;

                    // Update market metrics in state
                    marketMetrics[market] = {
                        spread,
                        spreadPercentage,
                        lastBid,
                        lastAsk,
                        timestamp: Date.now(), // Add timestamp for tracking data freshness
                    };

                    results.push(
                        `${market}: ${lastBid}/${lastAsk} (${spreadPercentage.toFixed(2)}% spread)`
                    );
                } catch (marketError) {
                    elizaLogger.error(
                        `Error processing market ${market}:`,
                        marketError
                    );
                    results.push(`${market}: Failed to fetch data`);
                }
            }

            // Update state if provided
            if (state) {
                state.marketMetrics = marketMetrics;
                state.watchlist = watchlist; // Update watchlist in state
            }

            // Return formatted results
            if (results.length === 0) {
                return "No markets in watchlist or unable to fetch BBO data";
            }

            return `Here are the latest BBO metrics for your watchlist:\n${results.join("\n")}`;
        } catch (error) {
            elizaLogger.error("BBO Provider error:", error);
            return "Unable to fetch BBO data. Please check your watchlist and try again.";
        }
    },
};
