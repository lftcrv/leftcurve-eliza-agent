import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { BaseParadexState, getParadexConfig } from "../utils/paradexUtils";

interface MarketInfo {
    base_token: string;
    quote_token: string;
    market: string;
    max_price_levels: number;
    max_position_size: string;
    min_position_size: string;
    min_trade_size: string;
    price_increment: string;
    size_increment: string;
    status: string;
    tick_size: string;
}

interface MarketsResponse {
    results: MarketInfo[];
}

async function fetchAvailableMarkets(
    market?: string
): Promise<MarketsResponse> {
    elizaLogger.info("Starting fetchAvailableMarkets...");

    try {
        const config = getParadexConfig();

        // Construct URL with optional market parameter
        const url = market
            ? `${config.apiBaseUrl}/markets?market=${market}`
            : `${config.apiBaseUrl}/markets`;

        elizaLogger.info("Fetching markets from URL:", url);

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to fetch markets: ${response.status} - ${errorText}`
            );
        }

        const data = await response.json();
        elizaLogger.info("Successfully fetched markets data");
        return data;
    } catch (error) {
        elizaLogger.error("Error in fetchAvailableMarkets:", error);
        throw error;
    }
}

function formatMarketInfo(market: MarketInfo): string {
    try {
        return `${market.market} | Min Trade: ${market.min_trade_size} | Max Position: ${market.max_position_size} | Status: ${market.status}`;
    } catch (error) {
        elizaLogger.error(
            "Error formatting market:",
            error,
            "Market data:",
            market
        );
        return `Error formatting market ${market.market}`;
    }
}

export const availableMarketsProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: BaseParadexState
    ) => {
        elizaLogger.info("Starting availableMarketsProvider.get...");

        if (!state) {
            state = (await runtime.composeState(message)) as BaseParadexState;
        }

        try {
            const marketsData = await fetchAvailableMarkets();

            if (!marketsData.results || marketsData.results.length === 0) {
                elizaLogger.info("No markets found");
                return "No available markets found.";
            }

            // Filter active markets and sort by market name
            const activeMarkets = marketsData.results
                .filter((market) => market.status === "active")
                .sort((a, b) => a.market.localeCompare(b.market));

            const formattedMarkets = activeMarkets.map(formatMarketInfo);

            // Store markets data in state if available
            if (state) {
                state.availableMarkets = activeMarkets;
            }

            const marketsSummary = `
Available Markets on Paradex:
${formattedMarkets.join("\n")}

Total Active Markets: ${activeMarkets.length}
Trade Pairs: ${Array.from(new Set(activeMarkets.map((m) => m.base_token))).join(
                ", "
            )}
`;

            elizaLogger.info("Markets data retrieved successfully");
            return marketsSummary;
        } catch (error) {
            elizaLogger.error("Error in availableMarketsProvider:", error);

            if (error instanceof Error) {
                if (error.message.includes("fetch")) {
                    return "Failed to retrieve markets from Paradex. Please try again later.";
                }
            }

            return "Unable to fetch available markets. Please try again later.";
        }
    },
};
