import { Provider, IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import {
    BaseParadexState,
    getParadexConfig,
    initializeAccount,
    ParadexAuthenticationError,
} from "../utils/paradexUtils";
import { Account } from "../utils/paradex-ts/types";
import { authenticate } from "../utils/paradex-ts/api";

interface OrderResult {
    market: string;
    side: string;
    size: string;
    price: string;
    remaining_size: string;
    type: string;
    status: string;
    created_at: number;
    id: string;
}

interface OrderResponse {
    results: OrderResult[];
}

class OrderFormatting {
    static formatNumber(value: string, decimals: number = 2): string {
        try {
            const num = parseFloat(value);
            return isNaN(num) ? "N/A" : num.toFixed(decimals);
        } catch {
            return "N/A";
        }
    }

    static formatDate(timestamp: number): string {
        try {
            return new Date(timestamp).toLocaleString();
        } catch {
            return "N/A";
        }
    }

    static formatOrder(order: OrderResult): string {
        try {
            const price = this.formatNumber(order.price, 2);
            const size = this.formatNumber(order.size, 4);
            const remainingSize = this.formatNumber(order.remaining_size, 4);
            const created = this.formatDate(order.created_at);

            return `${order.market} | ${order.side} ${size} @ ${price} | Type: ${order.type} | Remaining: ${remainingSize} | Created: ${created}`;
        } catch (error) {
            elizaLogger.error("Error formatting order:", error);
            return `Error formatting order ${order.id}`;
        }
    }
}

async function fetchOpenOrders(
    account: Account,
    market?: string
): Promise<OrderResponse> {
    elizaLogger.info("Starting fetchOpenOrders...");

    try {
        const config = getParadexConfig();

        // Authenticate and get JWT token
        elizaLogger.info("Authenticating with Paradex...");
        try {
            account.jwtToken = await authenticate(config, account);
        } catch (error) {
            elizaLogger.error("Authentication failed:", error);
            throw new ParadexAuthenticationError(
                "Failed to authenticate with Paradex",
                error
            );
        }

        const url = market
            ? `${config.apiBaseUrl}/orders?market=${market}`
            : `${config.apiBaseUrl}/orders`;

        elizaLogger.info("Fetching open orders from URL:", url);

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${account.jwtToken}`,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to fetch orders: ${response.status} - ${errorText}`
            );
        }

        const data = await response.json();
        elizaLogger.info("Successfully fetched orders data");
        return data;
    } catch (error) {
        elizaLogger.error("Error in fetchOpenOrders:", error);
        throw error;
    }
}

export const openOrdersProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: BaseParadexState
    ) => {
        elizaLogger.info("Starting openOrdersProvider.get...");

        if (!state) {
            state = (await runtime.composeState(message)) as BaseParadexState;
        }

        // Initialize account
        const account = await initializeAccount(runtime);
        elizaLogger.success("Account initialized");

        try {
            const ordersData = await fetchOpenOrders(account);

            if (!ordersData.results?.length) {
                return "No open orders found.";
            }

            const openOrders = ordersData.results
                .filter((order) => order.status === "OPEN")
                .sort((a, b) => b.created_at - a.created_at);

            if (!openOrders.length) {
                return "No open orders found.";
            }

            // Store full order data in state
            if (state) {
                state.openOrders = openOrders;
            }

            const summary = `
Total Open Orders: ${openOrders.length}

Current Orders:
${openOrders.map((order) => OrderFormatting.formatOrder(order)).join("\n")}`;

            elizaLogger.info("Successfully retrieved orders");
            return summary.trim();
        } catch (error) {
            elizaLogger.error("Error in openOrdersProvider:", error);

            if (error instanceof ParadexAuthenticationError) {
                return "Authentication failed. Please check your credentials.";
            }

            return "Unable to fetch orders. Please check your configuration and try again.";
        }
    },
};
