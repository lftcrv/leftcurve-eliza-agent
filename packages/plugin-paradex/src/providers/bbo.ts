import { Provider, IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import { BaseParadexState, getParadexConfig } from "../utils/paradexUtils";

export interface BBOState extends BaseParadexState {
    watchlist: string[];
    marketMetrics: Record<string, MarketMetrics>;
}

interface BBOResponse {
    ask: string;
    ask_size: string;
    bid: string;
    bid_size: string;
    market: string;
    last_updated_at: number;
    seq_no: number;
}

interface MarketMetrics {
    spread: number;
    spreadPercentage: number;
    lastBid: number;
    lastAsk: number;
    timestamp: number;
}

class BBOFormatting {
    static formatNumber(value: string, decimals: number = 2): string {
        try {
            const num = parseFloat(value);
            return isNaN(num) ? "N/A" : num.toFixed(decimals);
        } catch {
            return "N/A";
        }
    }

    static calculateSpread(
        bid: number,
        ask: number
    ): { spread: number; percentage: number } {
        const spread = ask - bid;
        const percentage = (spread / bid) * 100;
        return { spread, percentage };
    }

    static formatMarketBBO(market: string, data: BBOResponse): string {
        try {
            const bid = parseFloat(data.bid);
            const ask = parseFloat(data.ask);
            const { percentage } = this.calculateSpread(bid, ask);

            return `${market}: ${this.formatNumber(
                data.bid
            )}/${this.formatNumber(data.ask)} (${this.formatNumber(
                percentage.toString()
            )}% spread)`;
        } catch (error) {
            elizaLogger.error("Error formatting BBO:", error);
            return `${market}: Failed to format data`;
        }
    }
}

async function fetchMarketBBO(market: string): Promise<BBOResponse> {
    try {
        const config = getParadexConfig();
        const response = await fetch(`${config.apiBaseUrl}/bbo/${market}`, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch BBO for ${market}: ${response.status}`
            );
        }

        return await response.json();
    } catch (error) {
        elizaLogger.error(`Error fetching BBO for ${market}:`, error);
        throw error;
    }
}

export const bboProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: BBOState) => {
        elizaLogger.info("Starting BBO provider...");

        if (!state) {
            state = (await runtime.composeState(message)) as BBOState;
        }
        
        // Ensure watchlist and marketMetrics exist
        state.watchlist = state.watchlist || [];
        state.marketMetrics = state.marketMetrics || {};

        try {
            const marketMetrics: Record<string, MarketMetrics> = {};
            const results: string[] = [];

            if (state.watchlist.length === 0) {
                return "No markets in watchlist. Please add markets first.";
            }

            for (const market of state.watchlist) {
                try {
                    const bboData = await fetchMarketBBO(market);
                    const bid = parseFloat(bboData.bid);
                    const ask = parseFloat(bboData.ask);
                    const { spread, percentage } =
                        BBOFormatting.calculateSpread(bid, ask);

                    marketMetrics[market] = {
                        spread,
                        spreadPercentage: percentage,
                        lastBid: bid,
                        lastAsk: ask,
                        timestamp: bboData.last_updated_at,
                    };

                    results.push(
                        BBOFormatting.formatMarketBBO(market, bboData)
                    );
                } catch (marketError) {
                    results.push(`${market}: Failed to fetch data`);
                }
            }

            state.marketMetrics = marketMetrics;

            const summary = `
Latest BBO Metrics for Your Watchlist:
${results.join("\n")}`;

            elizaLogger.info("Successfully retrieved BBO data");
            return summary.trim();
        } catch (error) {
            elizaLogger.error("Error in BBO provider:", error.message);
            return "Unable to fetch BBO data. Please check your configuration and try again.";
        }
    },
};
