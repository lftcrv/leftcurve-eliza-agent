import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { getJwtToken, ParadexAuthError } from "../utils/getJwtParadex";
import { ParadexState } from "../types";

interface OrderResponse {
    results: {
        account: string;
        avg_fill_price: string;
        cancel_reason?: string;
        client_id: string;
        created_at: number;
        flags: string[];
        id: string;
        instruction: string;
        last_updated_at: number;
        market: string;
        price: string;
        published_at: number;
        received_at: number;
        remaining_size: string;
        seq_no: number;
        side: string;
        size: string;
        status: string;
        stp: string;
        timestamp: number;
        trigger_price: string;
        type: string;
    }[];
}

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || "testnet").toLowerCase();
    if (network !== "testnet" && network !== "prod") {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

async function fetchOpenOrders(
    jwt: string,
    market?: string
): Promise<OrderResponse> {
    const baseUrl = getParadexUrl();
    const url = market
        ? `${baseUrl}/orders?market=${market}`
        : `${baseUrl}/orders`;

    elizaLogger.info("Fetching open orders from URL:", url);

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch orders: ${response.status} ${response.statusText}`
            );
        }

        const data = await response.json();
        elizaLogger.info(
            "Successfully fetched orders:",
            JSON.stringify(data, null, 2)
        );
        return data;
    } catch (error) {
        elizaLogger.error("Error fetching open orders:", error);
        throw error;
    }
}

export const openOrdersProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State & ParadexState
    ) => {
        elizaLogger.info("Starting openOrdersProvider.get...");

        try {
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexAuthError("ETHEREUM_PRIVATE_KEY not set");
            }

            // Get JWT token
            const authResult = await getJwtToken(ethPrivateKey);
            if (!authResult.jwt_token) {
                throw new ParadexAuthError("Failed to get JWT token");
            }

            if (state) {
                state.jwtToken = authResult.jwt_token;
                state.jwtExpiry = authResult.expiry;
                state.starknetAccount = authResult.account_address;
            }

            const ordersData = await fetchOpenOrders(authResult.jwt_token);

            if (!ordersData.results || ordersData.results.length === 0) {
                elizaLogger.info("No open orders found");
                return "No open orders found.";
            }

            const formattedOrders = ordersData.results.map((order) => {
                const price = parseFloat(order.price).toFixed(2);
                const size = parseFloat(order.size).toFixed(4);
                const remainingSize = parseFloat(order.remaining_size).toFixed(
                    4
                );
                const created = new Date(order.created_at).toLocaleString();

                const formatted = `${order.market} | ${order.side} ${size} @ ${price} | Type: ${order.type} | Remaining: ${remainingSize} | Created: ${created}`;
                elizaLogger.info("Formatted order:", formatted);
                return formatted;
            });

            if (state) {
                state.openOrders = ordersData.results;
            }

            const finalResponse = `Current Open Orders:\n${formattedOrders.join(
                "\n"
            )}`;
            elizaLogger.info("Returning formatted orders:", finalResponse);
            return finalResponse;
        } catch (error) {
            elizaLogger.error("Open Orders Provider error:", error);
            if (error instanceof ParadexAuthError) {
                elizaLogger.error("Auth Details:", error.details);
            }
            return "Unable to fetch open orders. Please try again later.";
        }
    },
};
