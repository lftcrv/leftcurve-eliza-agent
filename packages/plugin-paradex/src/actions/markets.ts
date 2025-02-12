import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || 'testnet').toLowerCase();
    if (network !== 'testnet' && network !== 'prod') {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

export const getMarketsAction: Action = {
    name: "GET_MARKETS",
    similes: ["SHOW_MARKETS", "LIST_MARKETS", "MARKETS_INFO"],
    description: "Retrieves available markets from Paradex",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        const baseUrl = getParadexUrl();
        try {
            const response = await fetch(
                `${baseUrl}/markets`,
                {
                    headers: { Accept: "application/json" },
                }
            );

            if (!response.ok) {
                throw new Error(
                    `API request failed: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();

            const markets = data.results;
            const formattedMarkets = markets
                .map(
                    (market: any) =>
                        `${market.symbol} (Base: ${market.base_currency}, Quote: ${market.quote_currency}, Settlement: ${market.settlement_currency})`
                )
                .join("\n");

            return formattedMarkets; // Note: Removed the success/response wrapper
        } catch (error) {
            console.error("Error in GET_MARKETS handler:", error);
            return `Failed to fetch markets: ${error.message}`;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "What markets are available on Paradex?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the available markets on Paradex: ETH-USD-PERP",
                    action: "GET_MARKETS",
                },
            },
        ],
    ],
};
