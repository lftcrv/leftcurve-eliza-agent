import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
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
            const markets = state?.watchlist;
            const marketMetrics = state?.marketMetrics || {};
            const results = [];

            for (const market of markets) {
                const response = await fetch(
                    `https://api.testnet.paradex.trade/v1/bbo/${market}`
                );
                if (!response.ok) continue;

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
                };
                results.push(
                    `${market}: ${lastBid}/${lastAsk} (${spreadPercentage.toFixed(2)}% spread)`
                );
            }

            if (state) state.marketMetrics = marketMetrics;
            return results.join("\n");
        } catch (error) {
            console.error("BBO Provider error:", error);
            return "Unable to fetch BBO data";
        }
    },
};
