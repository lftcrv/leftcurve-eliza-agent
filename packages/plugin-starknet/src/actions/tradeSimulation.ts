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
} from "@ai16z/eliza";
import { fetchQuotes, QuoteRequest } from "@avnu/avnu-sdk";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { validateStarknetConfig } from "../environment.ts";
import { STARKNET_TOKENS } from "../utils/constants.ts";
import { TradeDecision } from "./types.ts";
import { isSwapContent } from "./swap.ts";
import { shouldTradeTemplateInstruction } from "./templates.ts";
import { MultipleTokenInfos, MultipleTokenPriceFeeds } from "./trade.ts";

export async function getSimulatedWalletBalances(
    runtime: IAgentRuntime
): Promise<string> {
    const db = runtime.databaseAdapter;

    try {
        // Wait for balance retrieval
        const balanceRow = await (
            db as SqliteDatabaseAdapter
        ).getWalletBalances(runtime.agentId);

        if (!balanceRow) {
            return "No wallet data available";
        }

        const formattedBalances = STARKNET_TOKENS.map(({ address, name }) => {
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

        const walletBalances = await getSimulatedWalletBalances(runtime);

        const shouldTradeTemplate =
            shouldTradeTemplateInstruction +
            "\n\n And \n\n" +
            tokenInfos +
            "\n\n And \n\n" +
            tokenPrices +
            `{{{providers}}}` +
            "\n\n And here is your wallet's balances : \n\n" +
            `${walletBalances}`;

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
            const parsedDecision: TradeDecision = JSON.parse(
                tradeDecisionResponse
            );

            if (parsedDecision.shouldTrade === "yes") {
                const swap = parsedDecision.swap;
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

                    // Get quote for the proposed trade
                    const quoteParams: QuoteRequest = {
                        sellTokenAddress: swap.sellTokenAddress,
                        buyTokenAddress: swap.buyTokenAddress,
                        sellAmount: BigInt(swap.sellAmount),
                    };

                    const quotes = await fetchQuotes(quoteParams);
                    const bestQuote = quotes[0];

                    if (!bestQuote) {
                        throw new Error(
                            "No valid quote received from fetchQuotes."
                        );
                    }

                    // Update simulated wallet with the quote results
                    await (
                        runtime.databaseAdapter as SqliteDatabaseAdapter
                    ).updateSimulatedWallet(
                        runtime.agentId,
                        bestQuote.sellTokenAddress,
                        Number(bestQuote.sellAmount),
                        bestQuote.buyTokenAddress,
                        Number(bestQuote.buyAmount)
                    );

                    // Create enhanced response with quote information
                    const enhancedResponse: TradeDecision & { quoteInfo: any } =
                        {
                            ...parsedDecision,
                            quoteInfo: {
                                sellAmount: bestQuote.sellAmount.toString(),
                                buyAmount: bestQuote.buyAmount.toString(),
                                sellTokenAddress: bestQuote.sellTokenAddress,
                                buyTokenAddress: bestQuote.buyTokenAddress,
                            },
                        };

                    // Send callback with the enhanced response
                    callback?.({
                        text: JSON.stringify(enhancedResponse, null, 2),
                    });

                    return true;
                } catch (error) {
                    console.error("Error during token swap:", error);
                    callback?.({
                        text: `Error during swap: ${error.message}`,
                    });
                    return false;
                }
            } else {
                // For "no" trade decisions, pass through the original response
                callback?.({
                    text: JSON.stringify(parsedDecision, null, 2),
                });
            }
        } catch (error) {
            console.error("Error parsing JSON response:", error);
            callback?.({
                text: "Error processing trade decision response",
            });
            return false;
        }
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Execute SIMULATE_STARKNET_TRADE",
                },
            },
            {
                user: "{{agent}}",
                content: { text: "", action: "SIMULATE_STARKNET_TRADE" },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "simulate Trade",
                },
            },
            {
                user: "{{agent}}",
                content: { text: "", action: "SIMULATE_STARKNET_TRADE" },
            },
        ],
    ] as ActionExample[][],
} as Action;
