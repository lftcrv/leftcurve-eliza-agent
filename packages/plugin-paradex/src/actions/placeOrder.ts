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
import { placeOrder, PlaceOrderParams } from "../utils/paradexOrder";

interface ParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
    lastOrderResult?: any;
    orderRequestObj?: {
        action: string;
        market: string;
        size: number;
        price?: number;
    };
}

interface OrderRequest {
    action: "long" | "short" | "buy" | "sell";
    market: string;
    size: number;
    price?: number;
    explanation: string;
}

const orderTemplate = `Analyze ONLY the latest user message to extract order details.
Last message: "{{lastMessage}}"

Rules:
1. ALL markets MUST be formatted as CRYPTO-USD-PERP (e.g., "BTC-USD-PERP", "ETH-USD-PERP")
2. If only the crypto name is given (e.g., "ETH" or "BTC"), append "-USD-PERP"
3. Size must be a number
4. Price is optional - if specified, creates a limit order

Examples of valid messages and their parsing:
- "Long 0.1 ETH" → market: "ETH-USD-PERP"
- "Short 0.5 BTC at 96000" → market: "BTC-USD-PERP"
- "Buy 1000 USDC worth of ETH" → market: "ETH-USD-PERP"
- "Sell 0.2 ETH at 5000" → market: "ETH-USD-PERP"

Respond with a JSON markdown block containing ONLY the order details:
\`\`\`json
{
  "action": "long",
  "market": "ETH-USD-PERP",  // Must always be CRYPTO-USD-PERP format
  "size": 0.1,
}
\`\`\`

Or for a limit order:
\`\`\`json
{
  "action": "short",
  "market": "BTC-USD-PERP",  // Must always be CRYPTO-USD-PERP format
  "size": 0.5,
  "price": 96000,
}
\`\`\``;

export const paradexPlaceOrderAction: Action = {
    name: "PARADEX_PLACE_ORDER",
    similes: ["PLACE_ORDER", "SUBMIT_ORDER", "CREATE_ORDER"],
    description: "Places an order on Paradex",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: ParadexState,
    ) => {
        elizaLogger.info("Starting order placement...");

        if (!state) {
            state = (await runtime.composeState(message)) as ParadexState;
            elizaLogger.success("State composed");
        }

        try {
            state.lastMessage = message.content.text;

            const context = composeContext({
                state,
                template: orderTemplate,
            });

            elizaLogger.info("Context generated, calling model...");
            const request = (await generateObjectDeprecated({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
            })) as OrderRequest;

            if (
                !request ||
                !request.market ||
                !request.size ||
                !request.action
            ) {
                elizaLogger.warn(
                    "Invalid or incomplete order request:",
                    request,
                );
                return false;
            }

            // Store request in state
            state.orderRequestObj = request;
            elizaLogger.success("Using order request:", request);

            // Convert to PlaceOrderParams format
            const orderParams: PlaceOrderParams = {
                market: request.market,
                side:
                    request.action === "long" || request.action === "buy"
                        ? "BUY"
                        : "SELL",
                type: request.price ? "LIMIT" : "MARKET",
                size: request.size.toString(),
                instruction: "GTC",
            };

            // Add price for limit orders
            if (request.price) {
                orderParams.price = request.price.toString();
            }

            elizaLogger.info("Placing order with params:", orderParams);

            const result = await placeOrder(orderParams);
            state.lastOrderResult = result;
            elizaLogger.success("Order placed successfully:", result);

            // Create trading info DTO for backend
            const tradeObject = {
                tradeId:
                    result.order?.id ||
                    result.transaction_hash ||
                    Date.now().toString(),
                trade: {
                    market: orderParams.market,
                    side: orderParams.side,
                    type: orderParams.type,
                    size: orderParams.size,
                    price: orderParams.price,
                },
            };

            const tradingInfoDto = {
                runtimeAgentId: state.agentId,
                information: tradeObject,
            };

            // Send trading info to backend if configured
            if (process.env.BACKEND_PORT && process.env.BACKEND_API_KEY) {
                await sendTradingInfo(
                    tradingInfoDto,
                    process.env.BACKEND_PORT,
                    process.env.BACKEND_API_KEY,
                );
            }

            return true;
        } catch (error) {
            elizaLogger.error("Order placement error:", error);
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Long 0.1 ETH" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Market long order placed for ETH-USD-PERP.",
                    action: "PARADEX_PLACE_ORDER",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Short 0.05 BTC at 96000" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Limit short order placed for BTC-USD-PERP.",
                    action: "PARADEX_PLACE_ORDER",
                },
            },
        ],
    ],
};

// Helper function to send trading info to backend
export const sendTradingInfo = async (
    tradingInfoDto: any,
    backendPort: string,
    apiKey: string,
) => {
    try {
        const isLocal = process.env.LOCAL_DEVELOPMENT === "TRUE";
        const host = isLocal ? process.env.HOST : "host.docker.internal";

        elizaLogger.info(
            "Sending trading info to:",
            `http://${host}:${backendPort}/api/trading-information`,
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
            },
        );

        if (!response.ok) {
            throw new Error(
                `Failed to save trading info: ${response.status} ${response.statusText}`,
            );
        }

        elizaLogger.info("Trading information saved successfully");
        return await response.json();
    } catch (error) {
        elizaLogger.error(
            "Error saving trading information:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
