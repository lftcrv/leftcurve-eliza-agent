import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";

export const marketDataProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        console.log("Starting marketDataProvider.get...");
        try {
            console.log("Fetching markets data...");
            const response = await fetch("https://api.testnet.paradex.trade/v1/markets", {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const markets = data.results;
            console.log("Received markets data:", markets);

            return `Currently available markets on Paradex: ${
                markets.map((m: any) => m.symbol).join(", ")
            }`;
        } catch (error) {
            console.error("Error in marketDataProvider:", error);
            return "Unable to fetch market data.";
        }
    }
};
