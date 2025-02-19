import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { ParadexState } from "../types";

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || 'testnet').toLowerCase();
    if (network !== 'testnet' && network !== 'prod') {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

export const marketDataProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State & ParadexState
    ) => {
        console.log("Starting marketDataProvider.get...");
        const baseUrl = getParadexUrl();
        try {
            const response = await fetch(
                `${baseUrl}/markets`,
                {
                    headers: { Accept: "application/json" },
                }
            );

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            const markets = data.results;
            const marketList = `Available markets on Paradex: ${markets.map((m) => m.symbol).join(", ")}`;
            if (state) {
                state.marketsInfo = marketList;
            }

            return marketList;
        } catch (error) {
            console.error("Error in marketDataProvider:", error);
            const errorMsg = "Unable to fetch market data.";
            if (state) {
                state.marketsInfo = errorMsg;
            }
            return errorMsg;
        }
    },
};
