import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

interface LinePriceFeedItem {
    date: string;
    value: number;
  }

  interface MarketData {
    currentPrice: number;
    marketCap: number;
    fullyDilutedValuation?: number | null;
    starknetTvl: number;
    priceChange1h: number;
    priceChangePercentage1h: number;
    priceChange24h: number;
    priceChangePercentage24h: number;
    priceChange7d: number;
    priceChangePercentage7d: number;
    marketCapChange24h?: number | null;
    marketCapChangePercentage24h?: number | null;
    starknetVolume24h: number;
    starknetTradingVolume24h: number;
  }

  interface Token {
    position: number;
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    logoUri: string;
    verified: boolean;
    market: MarketData;
    linePriceFeedInUsd: LinePriceFeedItem[];
  }

  const getTokensWithLargestTVL = async (): Promise<Token[]> => {
    try {
      const response = await fetch("https://starknet.impulse.avnu.fi/v1/tokens", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
      }

      const data: Token[] = await response.json();
      return data;
    } catch (error) {
      console.error("Error :", error);
      throw error;
    }
  };


  const processTokensForLLM = (tokens: Token[]) => {
    return tokens
      .filter((token) => token.position <= 20)
      .map((token) => ({
        name: token.name,
        symbol: token.symbol,
        currentPrice: token.market.currentPrice,
        priceChange1h: token.market.priceChangePercentage1h,
        priceChange24h: token.market.priceChangePercentage24h,
        priceChange7d: token.market.priceChangePercentage7d,
        marketCap: token.market.marketCap,
        starknetTvl: token.market.starknetTvl,
        starknetTradingVolume24h: token.market.starknetTradingVolume24h,
        linePriceFeedInUsd: token.linePriceFeedInUsd.slice(0, 20).map((item) => ({
          date: item.date,
          value: item.value,
        })),
      }));
  };

  const largestTVLProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        const prompt = `
You are a trading decision assistant specializing in analyzing cryptocurrency market data. Below is information about the top 20 tokens ranked by Total Value Locked (TVL) on StarkNet. For each token, you have the following data:

1. Basic Information: Name and symbol.
2. Market Metrics:
   - Current price.
   - Price changes over the last 1 hour, 24 hours, and 7 days (in percentages).
   - Market capitalization.
   - Total Value Locked (TVL).
   - Trading volume on StarkNet over the last 24 hours.
3. Historical Price Data: A price feed (linePriceFeedInUsd) showing price trends over time with precise dates and values.

Your task:
1. Identify the tokens with the highest growth potential based on price changes (1h, 24h, and 7d) and trading volume trends.
2. Highlight any tokens that are undervalued, considering their high TVL compared to their market capitalization.
3. For each token, analyze the historical price trends (linePriceFeedInUsd) to identify significant price patterns or potential reversals.
4. Recommend which tokens are good candidates for short-term trading and which are better suited for long-term holding, based on your analysis.

Output format:
Provide your insights in the following structure:
- Token Symbol: Your insights and recommendations (e.g., "LORDS: High potential for short-term gains due to significant 24h growth and consistent trading volume increase.").
- Include key metrics from your analysis to justify your recommendations.
- Summarize the top 3 tokens for immediate action (buy, hold, or sell) with clear reasoning.

Data : \n
`;

        try {
            const tokens = await getTokensWithLargestTVL();

            const processedData = processTokensForLLM(tokens);

            return prompt + JSON.stringify(processedData, null, 2);
          } catch (error) {
            console.error("Error :", error);
            throw error;
          }
    },
};

export { largestTVLProvider };