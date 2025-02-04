import {
    Action,
    ActionExample,
    booleanFooter,
    composeContext,
    Content,
    elizaLogger,
    generateMessageResponse,
    generateObjectDeprecated,
    generateText,
    generateTrueOrFalse,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    messageCompletionFooter,
    ModelClass,
    State,
} from "@ai16z/eliza";
import {
    executeSwap as executeAvnuSwap,
    fetchQuotes,
    QuoteRequest,
} from "@avnu/avnu-sdk";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { RpcProvider, Contract, wallet } from "starknet";
import { getStarknetAccount } from "../utils/index.ts";
import { validateStarknetConfig } from "../environment.ts";
import * as dotenv from "dotenv";
import axios from "axios";

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

interface TokenDetails {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    coingeckoid?: string;
    verified: boolean;
    market: MarketData;
    tags: string[];
}

interface SwapContent {
    sellTokenAddress: string;
    buyTokenAddress: string;
    sellAmount: string;
}

interface LinePriceFeedItem {
    date: string;
    value: number;
}

interface TokenPriceFeed {
    tokenAddress: string;
    tokenName: string;
    priceFeed: LinePriceFeedItem[];
}

interface Swap {
    sellTokenAddress: string;
    buyTokenAddress: string;
    sellAmount: string;
}

interface TradeDecision {
    shouldTrade: "yes" | "no";
    swap: Swap;
    Explanation: string;
    Tweet: string;
}

const tokens = [
    {
        address:
            "0x3b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee",
        name: "BROTHER",
        decimals: 18,
    },
    {
        address:
            "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
        name: "BTC",
        decimals: 8,
    },
    {
        address:
            "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        name: "ETH",
        decimals: 18,
    },
    {
        address:
            "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
        name: "STRK",
        decimals: 18,
    },
    {
        address:
            "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
        name: "LORDS",
        decimals: 18,
    },
    {
        address:
            "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
        name: "USDT",
        decimals: 6,
    },
    {
        address:
            "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
        name: "USDC",
        decimals: 6,
    },
    {
        address:
            "0x42b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2",
        name: "wstETH",
        decimals: 18,
    },
    {
        address:
            "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
        name: "WBTC",
        decimals: 8,
    },
    {
        address:
            "0x49210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee",
        name: "UNI",
        decimals: 18,
    },
    {
        address:
            "0x5574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
        name: "DAI",
        decimals: 18,
    },
    {
        address:
            "0x319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610",
        name: "rETH",
        decimals: 18,
    },
    {
        address:
            "0x70a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac",
        name: "LUSD",
        decimals: 18,
    },
    {
        address:
            "0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
        name: "xSTRK",
        decimals: 18,
    },
    {
        address:
            "0xc530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007",
        name: "NSTR",
        decimals: 18,
    },
    {
        address:
            "0x585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34",
        name: "ZEND",
        decimals: 18,
    },
    {
        address:
            "0x4878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b",
        name: "SWAY",
        decimals: 6,
    },
    {
        address:
            "0x102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b",
        name: "SSTR",
        decimals: 18,
    },
];

function convertAmountFromDecimals(
    address: string,
    amount: BigInt
): number | null {
    const token = tokens.find(
        (t) => t.address.toLowerCase() === address.toLowerCase()
    );
    if (!token) {
        console.error("Token not found for address:", address);
        return null;
    }
    const decimals = token.decimals;
    const sellAmount = amount;
    const result = Number(sellAmount) / 10 ** decimals;
    return result;
}

const fetchTokenDetails = async (
    tokenAddress: string
): Promise<TokenDetails> => {
    const url = `https://starknet.impulse.avnu.fi/v1/tokens/${tokenAddress}`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `HTTP Error: ${response.status} - ${response.statusText}`
            );
        }

        const data = await response.json();

        const { logoUri, ...filteredData } = data;

        return filteredData as TokenDetails;
    } catch (error) {
        console.error(
            `Error fetching details for token ${tokenAddress}:`,
            error
        );
        throw error;
    }
};

const fetchMultipleTokenDetails = async (
    tokens: { address: string; name: string }[]
): Promise<TokenDetails[]> => {
    const promises = tokens.map((token) => fetchTokenDetails(token.address));
    return Promise.all(promises);
};

const MultipleTokenInfos = async () => {
    try {
        const tokenDetails = await fetchMultipleTokenDetails(tokens);
        return (
            "# Here is some information about the market :\n" +
            JSON.stringify(tokenDetails, null, 2)
        );
    } catch (error) {
        console.error("Error fetching detailed token information:", error);
    }
};

const fetchTokenPriceFeed = async (
    tokenAddress: string,
    tokenName: string
): Promise<TokenPriceFeed> => {
    const url = `https://starknet.impulse.avnu.fi/v1/tokens/${tokenAddress}/prices/line?resolution=1D`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `HTTP Error: ${response.status} - ${response.statusText}`
            );
        }

        const data: LinePriceFeedItem[] = await response.json();
        return {
            tokenAddress,
            tokenName,
            priceFeed: data,
        };
    } catch (error) {
        console.error(
            `Error fetching price feed for token ${tokenName}:`,
            error
        );
        throw error;
    }
};

const fetchMultipleTokenPriceFeeds = async (
    tokens: { address: string; name: string }[]
): Promise<TokenPriceFeed[]> => {
    const promises = tokens.map((token) =>
        fetchTokenPriceFeed(token.address, token.name)
    );
    return Promise.all(promises);
};

const MultipleTokenPriceFeeds = async (): Promise<string> => {
    const priceFeeds = await fetchMultipleTokenPriceFeeds(tokens);
    return (
        "# Here are the token price feeds from the past three days: \n" +
        JSON.stringify(priceFeeds, null, 2)
    );
};

export function isSwapContent(content: SwapContent): content is SwapContent {
    // Validate types
    const validTypes =
        typeof content.sellTokenAddress === "string" &&
        typeof content.buyTokenAddress === "string" &&
        typeof content.sellAmount === "string";
    if (!validTypes) {
        return false;
    }
    // Validate addresses (must be 32-bytes long with 0x prefix)
    const validAddresses =
        content.sellTokenAddress.startsWith("0x") &&
        content.sellTokenAddress.length <= 66 &&
        content.sellTokenAddress.length >= 64 &&
        content.buyTokenAddress.startsWith("0x") &&
        content.buyTokenAddress.length <= 66 &&
        content.buyTokenAddress.length >= 64;

    return validAddresses;
}

async function getCurrentNews(searchTerm: string) {
    const apiKey = "1809642513d84b009fe12de73a3af77f";
    const response = await fetch(
        `https://newsapi.org/v2/everything?q=${searchTerm}&apiKey=${apiKey}`
    );
    const data = await response.json();
    return data.articles
        .slice(0, 5)
        .map(
            (article) =>
                `${article.title}\n${article.description}\n${article.url}\n${article.content.slice(0, 1000)}`
        )
        .join("\n\n");
}

export async function getSimulatedWalletBalances(
    runtime: IAgentRuntime
): Promise<string> {
    const db = runtime.databaseAdapter;

    try {
        // Attendre la récupération des soldes
        const balanceRow = await (
            db as SqliteDatabaseAdapter
        ).getWalletBalances(runtime.agentId);

        if (!balanceRow) {
            return "No wallet data available";
        }

        const formattedBalances = tokens.map(({ address, name }) => {
            return `${name}: ${balanceRow[address] ?? 0}`;
        });

        return formattedBalances.join(", ");
    } catch (error) {
        console.error("Error retrieving wallet balances:", error);
        return "Error retrieving wallet data";
    }
}

const tokenInfos = await MultipleTokenInfos();
const tokenPrices = await MultipleTokenPriceFeeds();

export const tradeSimulationAction: Action = {
    name: "SIMULATE_STARKNET_TRADE",
    similes: [
        "SIMULATE_TRADE",
        "STARKNET_SIMULATE_TOKEN_TRADE",
        "STARKNET_SIMULATE_TRADE_TOKENS",
        "STARKNET_SIMULATE_EXCHANGE_TOKENS",
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        await validateStarknetConfig(runtime);
        return true;
    },
    description:
        "Perform a simulate token swap on starknet. Use this action when a user asks you to trade.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting SIMULATE_STARKNET_TRADE handler...");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const searchTerm =
            "Bitcoin OR Ethereum market sentiment AND institutional investments";

        const BrutCurrentNews = await getCurrentNews(searchTerm);

        const currentNewsContext = `Respond by providing a summary of the following current news. This summary will be included in an LLM prompt.
        The current News :
        ${BrutCurrentNews}
`;

        const news = await generateText({
            runtime: runtime,
            context: currentNewsContext,
            modelClass: ModelClass.SMALL,
            stop: ["\n"],
        });

        const CurrentNews =
            "# Here are some news updates regarding Bitcoin or Ethereum market sentiment and institutional investments:\n" +
            news;

        async function _shouldTrade(state: State, analyse): Promise<boolean> {
            // If none of the above conditions are met, use the generateText to decide
            const shouldTradeContext = composeContext({
                state,
                template: analyse,
            });

            const response = await generateTrueOrFalse({
                context: shouldTradeContext,
                modelClass: ModelClass.SMALL,
                runtime,
            });

            return response;
        }

        const walletBalances = await getSimulatedWalletBalances(runtime);

        const shouldTradeTemplate =
            `# Task: Decide whether you should make any swap or stay idle and provide a response.

{{{bio}}}

Based on the market data, wallet information and some last news, decide if it's interesting to make a swap.

Warning: To avoid fee issues, always ensure you have at least 0.0016 ETH.

⚠️ **Strict Response Format (JSON only):**
Do not add any extra text before or after the JSON block. Follow the structure exactly.

### ✅ If the answer is **YES**, respond exactly like this:
\`\`\`json
{
  "shouldTrade": "yes",
  "swap": {
    "sellTokenAddress": "[The address of the token you are selling]",
    "buyTokenAddress": "[The address of the token you are buying]",
    "sellAmount": "[The amount to sell in wei]"
  },
  "Explanation": "[Brief explanation of why you made this decision. Write with your personality]",
  "Tweet": "[The tweet you would post after this trade as a big degen and being very trash]"
}
\`\`\`


### ❌ If the answer is NO, respond exactly like this:

\`\`\`json
{
  "shouldTrade": "no",
  "swap": {
    "sellTokenAddress": "null",
    "buyTokenAddress": "null",
    "sellAmount": "null"
  },
  "Explanation": "null",
  "Tweet": "null"
}
\`\`\`

### ⚠️ Rules:

- Only reply with the JSON block.
- "shouldTrade" must strictly be "yes" or "no".
- Do not add any extra explanation or text.
- Ensure JSON syntax is correct (commas, quotes, etc.).

Warning: To avoid fee issues, always ensure you have at least 0.0016 ETH and 4 STRK.

\n\n
` +
            CurrentNews +
            "\n\n And \n\n" +
            tokenInfos +
            "\n\n And \n\n" +
            tokenPrices +
            "\n\n And here is your wallet's balances : \n\n" +
            `${walletBalances}`;

        const shouldTradeContext = composeContext({
            state,
            template: shouldTradeTemplate,
        });

        const response = await generateText({
            context: shouldTradeContext,
            modelClass: ModelClass.MEDIUM,
            runtime,
        });

        callback({ text: response });

        try {
            const parsedDecision: TradeDecision = JSON.parse(response);
            const swap = parsedDecision.swap;

            if (parsedDecision.shouldTrade === "yes") {
                if (!isSwapContent(swap)) {
                    callback?.({
                        text: "Invalid swap content, please try again.",
                    });
                    return false;
                }
                try {
                    elizaLogger.log(
                        "buyTokenaddress : " + swap.buyTokenAddress
                    );
                    elizaLogger.log("sellAmount : " + swap.sellAmount);
                    elizaLogger.log(
                        "sellTokenAddress : " + swap.sellTokenAddress
                    );
                    // Get quote
                    const quoteParams: QuoteRequest = {
                        sellTokenAddress: swap.sellTokenAddress,
                        buyTokenAddress: swap.buyTokenAddress,
                        sellAmount: BigInt(swap.sellAmount),
                    };
                    const quote = await fetchQuotes(quoteParams);
                    (
                        runtime.databaseAdapter as SqliteDatabaseAdapter
                    ).updateSimulatedWallet(
                        runtime.agentId,
                        quote[0].sellTokenAddress,
                        convertAmountFromDecimals(
                            quote[0].sellTokenAddress,
                            quote[0].sellAmount
                        ),
                        quote[0].buyTokenAddress,
                        convertAmountFromDecimals(
                            quote[0].buyTokenAddress,
                            quote[0].buyAmount
                        )
                    );
                    return true;
                } catch (error) {
                    console.log("Error during token swap:", error);
                    callback?.({ text: `Error during swap:` });
                    return false;
                }
            } else {
                callback?.({
                    text: "It is not relevant to trade at the moment.",
                });
            }
        } catch (error) {
            console.error("Erreur de parsing JSON :", error);
            return null;
        }
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Execute EXECUTE_STARKNET_TRADE",
                },
            },
            {
                user: "{{agent}}",
                content: { text: "", action: "EXECUTE_STARKNET_TRADE" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Trade",
                },
            },
            {
                user: "{{agent}}",
                content: { text: "", action: "EXECUTE_STARKNET_TRADERLD" },
            },
        ],
    ] as ActionExample[][],
} as Action;
