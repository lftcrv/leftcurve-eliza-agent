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
import { isSwapContent } from "../utils/index.ts";

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

        try {
            const parsedDecision: TradeDecision = JSON.parse(response);
            const swap = parsedDecision.swap;

            if (parsedDecision.shouldTrade === "yes") {
                if (!isSwapContent(swap)) {
                    return false;
                }
                try {
                    const sellTokenAddress = STARKNET_TOKENS.find(
                        (t) =>
                            t.name === swap.sellTokenName
                    ).address;
                    const buyTokenAddress = STARKNET_TOKENS.find(
                        (t) =>
                            t.name === swap.buyTokenName
                    ).address;

                    // Get quote for the proposed trade
                    const quoteParams: QuoteRequest = {
                        sellTokenAddress: sellTokenAddress,
                        buyTokenAddress: buyTokenAddress,
                        sellAmount: BigInt(swap.sellAmount),
                    };
                    const quote = await fetchQuotes(quoteParams);
                    const bestQuote = quote[0];
                    // Execute swap
                    const swapResult = await executeAvnuSwap(
                        getStarknetAccount(runtime),
                        quote[0],
                        {
                            slippage: 0.05, // 5% slippage
                            executeApprove: true,
                        }
                    );
                    const tradeObject = {
                        tradeId: swapResult.transactionHash,
                        containerId: CONTAINER_ID,
                        trade: {
                            sellTokenName: swap.sellTokenName,
                            sellTokenAddress: sellTokenAddress,
                            buyTokenName: swap.buyTokenName,
                            buyTokenAddress: buyTokenAddress,
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
                    return false;
                }
            } else {
                console.log("It is not relevant to trade at the moment."); // TOODO: add better and personnalized reason related to personnality
            }
        } catch (error) {
            console.error("JSON parsing error:", error);
            return null;
        }
        return true;
    },
    examples: [] as ActionExample[][],
} as Action;
