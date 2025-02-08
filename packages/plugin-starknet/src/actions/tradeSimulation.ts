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
import { fetchQuotes, QuoteRequest } from "@avnu/avnu-sdk";
import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
import { validateStarknetConfig } from "../environment.ts";
import { STARKNET_TOKENS } from "../utils/constants.ts";
import { TradeDecision } from "./types.ts";
import { isSwapContent } from "./swap.ts";
import { shouldTradeTemplateInstruction } from "./templates.ts";
import {
    MultipleTokenInfos,
    MultipleTokenPriceFeeds,
    sendTradingInfo,
} from "./trade.ts";
import { RuntimeWithWallet, WalletAdapter } from "../walletAdapter.ts";

export async function getSimulatedWalletBalances(
    runtime: IAgentRuntime
): Promise<string> {
    const runtimeWithWallet = runtime as RuntimeWithWallet;
    const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);

    try {
        const balanceRow = await walletAdapter.getWalletBalances(
            runtime.agentId
        );

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
        const CONTAINER_ID = process.env.CONTAINER_ID ?? "default";

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
                    elizaLogger.warn("invalid swap content");
                    callback?.({
                        text: "Invalid swap content, please try again.",
                    });
                    return false;
                }

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
                const walletAdapter = new WalletAdapter(
                    runtime.databaseAdapter.db
                );
                await walletAdapter.updateSimulatedWallet(
                    runtime.agentId,
                    bestQuote.sellTokenAddress,
                    Number(bestQuote.sellAmount),
                    bestQuote.buyTokenAddress,
                    Number(bestQuote.buyAmount)
                );

                const tradeObject = {
                    tradeId: Date.now().toString(),
                    containerId: CONTAINER_ID,
                    trade: {
                        sellTokenName: STARKNET_TOKENS.find(
                            (t) =>
                                t.address.toLowerCase() ===
                                bestQuote.sellTokenAddress.toLowerCase()
                        ).name,
                        sellTokenAddress: bestQuote.sellTokenAddress,
                        buyTokenName: STARKNET_TOKENS.find(
                            (t) =>
                                t.address.toLowerCase() ===
                                bestQuote.buyTokenAddress.toLowerCase()
                        ).name,
                        buyTokenAddress: bestQuote.buyTokenAddress,
                        sellAmount: bestQuote.sellAmount.toString(),
                        buyAmount: bestQuote.buyAmount.toString(),
                        tradePriceUSD: bestQuote.buyTokenPriceInUsd || "0",
                        explanation: parsedDecision.Explanation,
                    },
                };

                try {
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
                    console.error("Error saving trading information:", error);
                    return false;
                }
            } else {
                const noTradeObject = {
                    tradeId: Date.now().toString(),
                    containerId: CONTAINER_ID,
                    trade: {
                        explanation: parsedDecision.Explanation,
                        noTradeReason: parsedDecision.Explanation,
                    },
                };

                try {
                    await sendTradingInfo(
                        noTradeObject,
                        process.env.BACKEND_PORT,
                        process.env.BACKEND_API_KEY
                    );
                    callback?.({
                        text: JSON.stringify(parsedDecision, null, 2),
                    });
                    return true;
                } catch (error) {
                    console.error("Error saving no-trade information:", error);
                    return false;
                }
            }
        } catch (error) {
            console.error("Error parsing JSON response:", error);
            callback?.({ text: "Error processing trade decision response" });
            return false;
        }
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
