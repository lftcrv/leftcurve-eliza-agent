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

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || "testnet").toLowerCase();
    if (network !== "testnet" && network !== "prod") {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

export const bboProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State & ParadexState
    ) => {
        const baseUrl = getParadexUrl();
        try {
            const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);
            const watchlist = await walletAdapter.getWatchlist(message.roomId);

            const marketMetrics = state?.marketMetrics || {};
            const results = [];

            for (const market of watchlist) {
                try {
                    const response = await fetch(`${baseUrl}/bbo/${market}`);

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

                    marketMetrics[market] = {
                        spread,
                        spreadPercentage,
                        lastBid,
                        lastAsk,
                        timestamp: Date.now(),
                    };

                    results.push(
                        `${market}: ${lastBid}/${lastAsk} (${spreadPercentage.toFixed(
                            2
                        )}% spread)`
                    );
                } catch (marketError) {
                    elizaLogger.error(
                        `Error processing market ${market}:`,
                        marketError
                    );
                    results.push(`${market}: Failed to fetch data`);
                }
            }

            if (state) {
                state.marketMetrics = marketMetrics;
                state.watchlist = watchlist;
            }

            if (results.length === 0) {
                return "No markets in watchlist or unable to fetch BBO data";
            }

            return `Here are the latest BBO metrics for your watchlist:\n${results.join(
                "\n"
            )}`;
        } catch (error) {
            elizaLogger.error("BBO Provider error:", error);
            return "Unable to fetch BBO data. Please check your watchlist and try again.";
        }
    },
};
