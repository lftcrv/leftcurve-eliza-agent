import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";

export const getMarketsAction: Action = {
    name: "GET_MARKETS",
    similes: ["SHOW_MARKETS", "LIST_MARKETS", "MARKETS_INFO"],
    description: "Retrieves available markets from Paradex",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const content = message.content as { text: string };
        console.log("Validating content:", content.text);
        const isValid = content.text.toLowerCase().includes("market");
        console.log("Is valid:", isValid);
        return isValid;
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        console.log("Starting GET_MARKETS handler...");
        try {
            console.log("Fetching markets from Paradex...");
            const response = await fetch("https://api.testnet.paradex.trade/v1/markets", {
                headers: { 'Accept': 'application/json' }
            });

            console.log("API Response status:", response.status);
            console.log("API Response ok:", response.ok);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Received data:", data);

            const markets = data.results;
            const formattedMarkets = markets.map((market: any) =>
                `${market.symbol} (Base: ${market.base_currency}, Quote: ${market.quote_currency}, Settlement: ${market.settlement_currency})`
            ).join("\n");

            // console.log("Formatted response:", formattedMarkets);

            return formattedMarkets;  // Note: Removed the success/response wrapper
        } catch (error) {
            console.error("Error in GET_MARKETS handler:", error);
            return `Failed to fetch markets: ${error.message}`;
        }
    },
    examples: [[
        { user: "{{user1}}", content: { text: "What markets are available on Paradex?" } },
        { user: "{{agentName}}", content: { text: "Here are the available markets on Paradex: ETH-USD-PERP", action: "GET_MARKETS" }}
    ]]
};