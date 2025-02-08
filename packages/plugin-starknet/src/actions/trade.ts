import {
    Action,
    ActionExample,
    composeContext,
    elizaLogger,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@elizaos/core";
import {
    executeSwap as executeAvnuSwap,
    fetchQuotes,
    QuoteRequest,
} from "@avnu/avnu-sdk";
import { getStarknetAccount } from "../utils/index.ts";
import { validateStarknetConfig } from "../environment.ts";
import axios from "axios";
import { TradeDecision } from "./types.ts";
import { STARKNET_TOKENS } from "../utils/constants.ts";
import { shouldTradeTemplateInstruction } from "./templates.ts";
import {
    fetchMultipleTokenDetails,
    fetchMultipleTokenPriceFeeds,
} from "../providers/marketInfosProvider.ts";
import { isSwapContent } from "./swap.ts";

export const MultipleTokenInfos = async () => {
    try {
        const tokenDetailsEssentials = await fetchMultipleTokenDetails(
            STARKNET_TOKENS
        );
        return (
            "# Here is some information about the market :\n" +
            JSON.stringify(tokenDetailsEssentials, null, 2)
        );
    } catch (error) {
        console.error("Error fetching detailed token information:", error);
    }
};

export const MultipleTokenPriceFeeds = async (): Promise<string> => {
    const priceFeeds = await fetchMultipleTokenPriceFeeds(STARKNET_TOKENS);
    return (
        "# Here are the token price feeds from the past three days: \n" +
        JSON.stringify(priceFeeds, null, 2)
    );
};

export const sendTradingInfo = async (tradingInfoDto, backendPort, apiKey) => {
    try {
        const response = await fetch(
            `http://host.docker.internal:${backendPort}/api/trading-information`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                },
                body: JSON.stringify(tradingInfoDto),
            }
        );
        elizaLogger.log("Trading information saved");
    } catch (error) {
        console.error(
            "Error saving trading information:",
            error.response?.data || error.message
        );
    }
};

// async function getCurrentNews(searchTerm: string) {
//     if (!NEWS_API_KEY) {
//         throw new Error("NEWS_API_KEY environment variable is not set");
//     }

//     const response = await fetch(
//         `https://newsapi.org/v2/everything?q=${searchTerm}&apiKey=${NEWS_API_KEY}`
//     );
//     const data = await response.json();
//     return data.articles
//         .slice(0, 5)
//         .map(
//             (article) =>
//                 `${article.title}\n${article.description}\n${article.url}\n${article.content.slice(0, 1000)}`
//         )
//         .join("\n\n");
// }

export const tradeAction: Action = {
    name: "EXECUTE_STARKNET_TRADE",
    similes: [
        "TRADE",
        "STARKNET_TOKEN_TRADE",
        "STARKNET_TRADE_TOKENS",
        "STARKNET_EXCHANGE_TOKENS",
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        await validateStarknetConfig(runtime);
        return true;
    },
    description:
        "Perform a token swap on starknet. Use this action when a user asks you to trade.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting EXECUTE_STARKNET_TRADE handler...");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const CONTAINER_ID = process.env.CONTAINER_ID ?? "default";
        const tokenInfos = await MultipleTokenInfos();
        const tokenPrices = await MultipleTokenPriceFeeds();

        const shouldTradeTemplate =
            shouldTradeTemplateInstruction +
            "\n\n And \n\n" +
            tokenInfos +
            "\n\n And \n\n" +
            tokenPrices +
            `{{{providers}}}`;
        const shouldTradeContext = composeContext({
            state,
            template: shouldTradeTemplate,
        });

        const response = await generateText({
            context: shouldTradeContext,
            modelClass: ModelClass.MEDIUM,
            runtime,
        });

        console.log(response);
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
                    // Get quote
                    const quoteParams: QuoteRequest = {
                        sellTokenAddress: swap.sellTokenAddress,
                        buyTokenAddress: swap.buyTokenAddress,
                        sellAmount: BigInt(swap.sellAmount),
                    };
                    const quote = await fetchQuotes(quoteParams);
                    const bestQuote = quote[0];
                    //getStarknetAccount(runtime);
                    // Execute swap
                    const swapResult = await executeAvnuSwap(
                        getStarknetAccount(runtime),
                        quote[0],
                        {
                            slippage: 0.05, // 5% slippage
                            executeApprove: true,
                        }
                    );
                    elizaLogger.log(
                        "Swap completed successfully! tx: " +
                            swapResult.transactionHash
                    );
                    callback?.({
                        text:
                            "Swap completed successfully! tx: " + // todo: be sure that the swap indeed executed successfully
                            swapResult.transactionHash,
                    });

                    const sellTokenName = STARKNET_TOKENS.find(
                        (t) =>
                            t.address.toLowerCase() ===
                            swap.sellTokenAddress.toLowerCase()
                    ).name;
                    const buyTokenName = STARKNET_TOKENS.find(
                        (t) =>
                            t.address.toLowerCase() ===
                            swap.buyTokenAddress.toLowerCase()
                    ).name;

                    const tradeObject = {
                        tradeId: swapResult.transactionHash,
                        containerId: CONTAINER_ID,
                        trade: {
                            sellTokenName: sellTokenName,
                            sellTokenAddress: swap.sellTokenAddress,
                            buyTokenName: buyTokenName,
                            buyTokenAddress: swap.buyTokenAddress,
                            sellAmount: swap.sellAmount.toString(),
                            buyAmount: bestQuote
                                ? bestQuote.buyAmount.toString()
                                : "0",
                            tradePriceUSD: bestQuote
                                ? bestQuote.buyTokenPriceInUsd
                                : "0",
                            explanation: parsedDecision.Explanation,
                        },
                    };

                    // Convert to JSON string
                    // const message = JSON.stringify(tradeObject);

                    // Create the DTO
                    const tradingInfoDto = {
                        runtimeAgentId: state.agentId,
                        information: tradeObject,
                    };

                    await sendTradingInfo(
                        tradingInfoDto,
                        process.env.BACKEND_PORT,
                        process.env.BACKEND_API_KEY
                    );

                    return true;
                } catch (error) {
                    console.log("Error during token swap:", error);
                    callback?.({ text: `Error during swap:` });
                    return false;
                }
            } else {
                console.log("It is not relevant to trade at the moment."); // TOODO: add better and personnalized reason related to personnality
                callback?.({
                    text: "It is not relevant to trade at the moment.",
                });
            }
        } catch (error) {
            console.error("JSON parsing error:", error);
            return null;
        }
        return true;
    },
    examples: [] as ActionExample[][],
} as Action;
