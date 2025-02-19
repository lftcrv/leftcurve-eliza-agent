import { v4 as uuid } from 'uuid';
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
import { MAX_TRADES_HISTORY, Trade, TradeDecision } from "./types.ts";
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
        const backendPort = process.env.BACKEND_PORT || "8080";
        const isLocal = process.env.LOCAL_DEVELOPMENT === "TRUE";
        const host = isLocal ? process.env.HOST : "host.docker.internal";
        
        elizaLogger.info(
            "Sending trading info to:",
            `http://${host}:${backendPort}/api/trading-information`
        );

        const response = await fetch(
            `http://${host}:${backendPort}/api/trading-information`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                },
                body: JSON.stringify(tradingInfoDto),
            }
        );

        if (!response.ok) {
            throw new Error(
                `Failed to save trading info: ${response.status} ${response.statusText}`
            );
        }

        elizaLogger.info("Trading information saved successfully");
        const data = await response.json();
        elizaLogger.info("Response data:", data);
    } catch (error) {
        elizaLogger.error(
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
    description: "Perform a token swap on starknet. Use this action when a user asks you to trade.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown; },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting SIMULATE_STARKNET_TRADE handler...");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const tradeMemories = await runtime.knowledgeManager.getMemories({
            roomId: state.roomId,
            count: 1
        });

        let tradeHistory: Trade[] = [];
        if (tradeMemories && tradeMemories.length > 0) {
            const lastMemory = tradeMemories[0];
            if (lastMemory.content && typeof lastMemory.content === 'object' && 'data' in lastMemory.content) {
                tradeHistory = lastMemory.content.data as Trade[];
            }
        }

        const CONTAINER_ID = process.env.CONTAINER_ID ?? "default";

        const shouldTradeTemplate = shouldTradeTemplateInstruction + "\n\n And here are your last trades : \n\n" +
            `${tradeHistory.length > 0 ?
                tradeHistory.map(trade => `- ${new Date(trade.timestamp).toLocaleString()}: Sold ${trade.sellAmount.toString()} ${trade.sellToken} for ${trade.buyAmount.toString()} ${trade.buyToken}`
                ).join('\n')
                : 'No trading history yet.'}`;

        console.log(shouldTradeTemplate);
        const shouldTradeContext = composeContext({
            state,
            template: shouldTradeTemplate,
        });

        const tradeDecisionResponse = await generateText({
            context: shouldTradeContext,
            modelClass: ModelClass.MEDIUM,
            runtime,
        });

        try {
            const parsedDecision: TradeDecision = JSON.parse(tradeDecisionResponse);

            if (parsedDecision.shouldTrade === "yes") {
                const swap = parsedDecision.swap;
                if (!isSwapContent(swap)) {
                    elizaLogger.warn("invalid swap content");
                    return false;
                }

                const sellTokenAddress = STARKNET_TOKENS.find(
                    (t) => t.name === swap.sellTokenName
                ).address;
                const buyTokenAddress = STARKNET_TOKENS.find(
                    (t) => t.name === swap.buyTokenName
                ).address;

                // Get quote for the proposed trade
                const quoteParams: QuoteRequest = {
                    sellTokenAddress: sellTokenAddress,
                    buyTokenAddress: buyTokenAddress,
                    sellAmount: BigInt(swap.sellAmount),
                };

                try {
                    const quotes = await fetchQuotes(quoteParams);
                    const bestQuote = quotes[0];

                    if (!bestQuote) {
                        throw new Error("No valid quote received from fetchQuotes.");
                    }

                    // Execute swap
                    const swapResult = await executeAvnuSwap(
                        getStarknetAccount(runtime),
                        bestQuote,
                        {
                            slippage: 0.05,
                            executeApprove: true,
                        }
                    );

                    const newTrade: Trade = {
                        sellToken: swap.sellTokenName,
                        buyToken: swap.buyTokenName,
                        sellAmount: swap.sellAmount.toString(),
                        buyAmount: bestQuote.buyAmount.toString(),
                        timestamp: Date.now()
                    };

                    const updatedTradeHistory = [newTrade, ...tradeHistory].slice(0, MAX_TRADES_HISTORY);

                    const tradeHistoryText = updatedTradeHistory
                        .map(trade => `${new Date(trade.timestamp).toLocaleString()}: Sold ${trade.sellAmount.toString()} ${trade.sellToken} for ${trade.buyAmount.toString()} ${trade.buyToken}`
                        )
                        .join('\n');

                    const tradeMemory: Memory = {
                        id: uuid() as `${string}-${string}-${string}-${string}-${string}`,
                        userId: state.userId!,
                        agentId: runtime.agentId,
                        roomId: state.roomId,
                        content: {
                            text: tradeHistoryText,
                            type: 'trade_history',
                            data: updatedTradeHistory
                        }
                    };

                    await runtime.knowledgeManager.createMemory(tradeMemory);

                    const tradeObject = {
                        tradeId: swapResult.transactionHash,
                        trade: {
                            sellTokenName: swap.sellTokenName,
                            sellTokenAddress: sellTokenAddress,
                            buyTokenName: swap.buyTokenName,
                            buyTokenAddress: buyTokenAddress,
                            sellAmount: swap.sellAmount.toString(),
                            buyAmount: bestQuote ? bestQuote.buyAmount.toString() : "0",
                            tradePriceUSD: bestQuote ? bestQuote.buyTokenPriceInUsd : "0",
                            explanation: parsedDecision.Explanation,
                        },
                    };

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
                console.log("It is not relevant to trade at the moment.");
                return true;
            }
        } catch (error) {
            console.error("JSON parsing error:", error);
            return false;
        }
    },
    examples: []
}
