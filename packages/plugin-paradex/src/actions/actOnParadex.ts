import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    generateObjectDeprecated,
    ModelClass,
    composeContext,
    elizaLogger,
} from "@elizaos/core";
import { openOrdersProvider } from "../providers/fetchOpenOrders";
import { openPositionsProvider } from "../providers/fetchOpenPositions";
import { bboProvider } from "../providers/bbo";
import { paradexPlaceOrderAction } from "./placeOrder";
import { paradexCancelOrderAction } from "./cancelOrder";
import { analysisParadexProvider } from "../providers/backendAnalysisParadex";

interface TradingDecision {
    action: "place_order" | "cancel_order" | "no_action";
    params?: {
        // For place_order
        market?: string;
        side?: "buy" | "sell";
        size?: number;
        price?: number;
        // For cancel_order
        orderId?: string;
    };
    // reasoning: string;
}

interface AnalysisState extends State {
    openOrders?: string;
    openPositions?: string;
    marketMetrics?: any;
    technicalAnalysis?: any;
    lastMessage?: string;
    orderRequestObj?: {
        action: string;
        market: string;
        size: number;
        price?: number;
    };
}

const decisionTemplate = `
Analyze the following market data to make a trading decision:

Open Orders:
{{openOrders}}

Current Positions:
{{openPositions}}

Market Metrics (BBO):
{{marketMetrics}}

Technical Analysis:
{{technicalAnalysis}}

Based on this data, determine the best action to take. Consider:
1. Market conditions and trends
2. Current positions and their profitability
3. Open orders that might need cancellation
4. New opportunities for order placement

Respond ONLY with a JSON object containing ONLY the decision details, without any explanation:
{
  "action": "place_order",
  "params": {
    "market": "BTC-USD-PERP",
    "side": "buy",
    "size": 0.1,
    "price": 50000  // Optional, omit for market orders
  },
}


Or for cancelling an order:
{
  "action": "cancel_order",
  "params": {
    "orderId": "123456789"
  },
}
`;

const cleanJsonResponse = (rawResponse: string): string => {
    let cleanedStr = rawResponse.replace(/```json\n?([\s\S]*?)\n?```/g, "$1");
    cleanedStr = cleanedStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    cleanedStr = cleanedStr.replace(/^\uFEFF/, "");
    cleanedStr = cleanedStr.trim();
    cleanedStr = cleanedStr
        .replace(/,(\s*}|\s*])/g, "$1") // Remove trailing commas
        .replace(/\n/g, "") // Remove newlines
        .replace(/\r/g, "") // Remove carriage returns
        .replace(/\t/g, "") // Remove tabs
        .replace(/\s+/g, " "); // Normalize spaces

    return cleanedStr;
};

export const actOnParadexAction: Action = {
    name: "ACT_ON_PARADEX",
    similes: ["ANALYZE_AND_TRADE", "TRADE_DECISION", "AUTO_TRADE"],
    description:
        "Analyzes market conditions and executes appropriate trading actions",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: AnalysisState
    ) => {
        elizaLogger.info("Starting ACT_ON_PARADEX analysis...");

        try {
            // Compose state if not provided
            if (!state) {
                state = (await runtime.composeState(message)) as AnalysisState;
            }

            // Fetch all necessary data using providers
            elizaLogger.info("Fetching market data from providers...");

            // Get open orders
            const ordersData = await openOrdersProvider.get(
                runtime,
                message,
                state
            );
            state.openOrders = ordersData;

            // Get current positions
            const positionsData = await openPositionsProvider.get(
                runtime,
                message,
                state
            );
            state.openPositions = positionsData;

            // Get market metrics (BBO)
            const bboData = await bboProvider.get(runtime, message, state);
            state.marketMetrics = bboData;

            // Get technical analysis
            const analysisData = await analysisParadexProvider.get(
                runtime,
                message,
                state
            );
            const analysisDataJSON = JSON.parse(analysisData);
            state.technicalAnalysis = JSON.stringify(analysisDataJSON, null, 2);

            // Generate trading decision
            elizaLogger.info("Generating trading decision...");
            const context = composeContext({
                state,
                template: decisionTemplate,
            });

            // Get the raw response from the model
            const rawResponse = await generateObjectDeprecated({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // Même si le parsing échoue, on peut avoir une réponse utilisable
            let decision;
            try {
                if (typeof rawResponse === "string") {
                    const cleanedStr = cleanJsonResponse(rawResponse);
                    decision = JSON.parse(cleanedStr);
                } else {
                    // Si rawResponse est déjà un objet, on l'utilise directement
                    decision = {
                        action: rawResponse.action,
                        params: {
                            market: rawResponse.market || "BTC-USD-PERP",
                            side: rawResponse.side,
                            size: parseFloat(rawResponse.size),
                            price: parseFloat(rawResponse.price),
                        },
                    };
                }
            } catch (parseError) {
                elizaLogger.warn(
                    "Error parsing decision, but continuing with raw response:",
                    parseError
                );
                // On utilise rawResponse même si le parsing a échoué
                decision = {
                    action: rawResponse.action,
                    params: {
                        market: rawResponse.market || "BTC-USD-PERP",
                        side: rawResponse.side,
                        size: parseFloat(rawResponse.size),
                        price: parseFloat(rawResponse.price),
                    },
                };
            }

            elizaLogger.info("Trading decision generated:", decision);

            // Execute the decided action
            if (
                decision.action === "place_order" &&
                (decision.params || rawResponse)
            ) {
                elizaLogger.info("Executing place order action...");

                if (!state) {
                    state = {} as AnalysisState;
                }

                // Use decision.params if available, otherwise use rawResponse
                const params = decision.params || {
                    market: rawResponse.market || "BTC-USD-PERP",
                    side: rawResponse.side,
                    size: parseFloat(rawResponse.size),
                    price: parseFloat(rawResponse.price),
                };

                elizaLogger.info("Using params:", params);

                state.orderRequestObj = {
                    action: params.side === "buy" ? "long" : "short",
                    market: params.market,
                    size: params.size,
                    price: params.price,
                };

                const success = await paradexPlaceOrderAction.handler(
                    runtime,
                    message,
                    state
                );
                return success;
            } else {
                // TODO: should send into tradeInfo
                elizaLogger.info("No action needed at this time");
                return true;
            }
        } catch (error) {
            console.log("Error in ACT_ON_PARADEX:", error);
            elizaLogger.error("Error in ACT_ON_PARADEX:", error);
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Analyze the market and take appropriate action",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Analysis complete, executing optimal trading action.",
                    action: "ACT_ON_PARADEX",
                },
            },
        ],
    ],
};
