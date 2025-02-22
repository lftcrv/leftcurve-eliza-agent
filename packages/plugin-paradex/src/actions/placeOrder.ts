import {
    Action,
    IAgentRuntime,
    Memory,
    generateObjectDeprecated,
    ModelClass,
    composeContext,
    elizaLogger,
} from "@elizaos/core";
import { signOrder } from "../utils/paradex-ts/signature";
import { SystemConfig, Account } from "../utils/paradex-ts/types";
import {
    ExtendedParadexState,
    getParadexConfig,
    getAccount,
    ParadexAuthenticationError,
} from "../utils/paradexUtils";
import { authenticate } from "../utils/paradex-ts/api";

interface OrderRequest {
    action: "long" | "short" | "buy" | "sell";
    market: string;
    size: number;
    price?: number;
}

interface PlaceOrderParams {
    market: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    size: string;
    price?: string;
    instruction?: string;
}

export class ParadexOrderError extends Error {
    constructor(
        message: string,
        public details?: any,
    ) {
        super(message);
        this.name = "ParadexOrderError";
    }
}

function formatPrice(price: number): string {
    // Round to nearest 0.1
    return (Math.round(price * 10) / 10).toFixed(1);
}

function formatSize(size: number): string {
    // Convert to string with maximum 8 decimal places
    return Number(size).toFixed(8);
}

async function placeOrder(
    config: SystemConfig,
    account: Account,
    orderDetails: PlaceOrderParams,
): Promise<any> {
    try {
        if (!account.jwtToken) {
            throw new ParadexOrderError("JWT token is missing");
        }

        const timestamp = Date.now();

        // Format the order details with proper price and size formatting, todo should adapt to each crypto for rounding decimals 
        const formattedOrderDetails: Record<string, string> = {
            market: orderDetails.market,
            side: orderDetails.side,
            type: orderDetails.type,
            size: formatSize(parseFloat(orderDetails.size)),
            ...(orderDetails.price && {
                price: formatPrice(parseFloat(orderDetails.price)),
            }),
            ...(orderDetails.instruction && {
                instruction: orderDetails.instruction,
            }),
        };

        const signature = signOrder(
            config,
            account,
            formattedOrderDetails,
            timestamp,
        );

        const response = await fetch(`${config.apiBaseUrl}/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${account.jwtToken}`,
            },
            body: JSON.stringify({
                ...formattedOrderDetails,
                signature,
                signature_timestamp: timestamp,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new ParadexOrderError(
                `HTTP Error ${response.status}: ${errorText}`,
            );
        }

        return await response.json();
    } catch (error) {
        elizaLogger.error("Error in placeOrderApi:", error);
        throw error instanceof ParadexOrderError
            ? error
            : new ParadexOrderError("Failed to place order", error);
    }
}

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
        state?: ExtendedParadexState,
    ) => {
        elizaLogger.info("Starting order placement...");

        try {
            // Initialize state if needed
            if (!state) {
                state = {} as ExtendedParadexState;
            }

            const config = getParadexConfig();

            // Initialize account
            const account = await getAccount(runtime);
            elizaLogger.success("Account initialized");

            try {
                account.jwtToken = await authenticate(config, account);
            } catch (error) {
                elizaLogger.error("Authentication failed:", error);
                throw new ParadexAuthenticationError(
                    "Failed to authenticate with Paradex",
                    error,
                );
            }
            elizaLogger.info("Authentication successful");

            const request = state.orderRequestObj;

            // Convert to order parameters with proper formatting
            const orderParams: PlaceOrderParams = {
                market: request.market,
                side:
                    request.action === "long" || request.action === "buy"
                        ? "BUY"
                        : "SELL",
                type: request.price ? "LIMIT" : "MARKET",
                size: formatSize(request.size),
                instruction: "GTC",
                ...(request.price && { price: formatPrice(request.price) }),
            };

            elizaLogger.info("Placing order with params:", orderParams);

            // Place the order
            const result = await placeOrder(config, account, orderParams);
            elizaLogger.success("Order placed successfully:", result);

            return true;
        } catch (error) {
            if (error instanceof ParadexOrderError) {
                elizaLogger.error(
                    "Order placement error:",
                    error.details || error.message,
                );
            } else {
                elizaLogger.error(
                    "Unexpected error during order placement:",
                    error,
                );
            }
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
