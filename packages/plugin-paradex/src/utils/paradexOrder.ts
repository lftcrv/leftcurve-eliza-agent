import { shortString } from "starknet";
import { signOrder } from "./paradex-ts/signature";
import { SystemConfig, Account } from "./paradex-ts/types";
import { authenticate, getParadexConfig } from "./paradexUtils";

export interface PlaceOrderParams {
    market: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    size: string;
    price?: string; // Optional for MARKET orders
    instruction?: string; // Optional (e.g., "GTC", "FOK", "IOC")
}

/**
 * Places an order by signing and sending it to the Paradex API using fetch.
 */
export async function placeOrderApi(
    config: SystemConfig,
    account: Account,
    orderDetails: PlaceOrderParams,
): Promise<any> {
    if (!account.jwtToken) {
        throw new Error("JWT token is missing. Please authenticate first.");
    }

    const timestamp = Date.now();

    const formattedOrderDetails: Record<string, string> = {
        market: orderDetails.market,
        side: orderDetails.side,
        type: orderDetails.type,
        size: orderDetails.size,
        ...(orderDetails.price ? { price: orderDetails.price } : {}),
        ...(orderDetails.instruction
            ? { instruction: orderDetails.instruction }
            : {}),
    };

    const signature = signOrder(
        config,
        account,
        formattedOrderDetails,
        timestamp,
    );

    const requestBody = JSON.stringify({
        ...orderDetails,
        signature,
        signature_timestamp: timestamp,
    });

    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${account.jwtToken}`,
    };

    try {
        const response = await fetch(`${config.apiBaseUrl}/orders`, {
            method: "POST",
            headers,
            body: requestBody,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
        }

        const responseData = await response.json();
        console.log("Order placed successfully:", responseData);
        return responseData;
    } catch (error) {
        console.error("Error placing order:", error);
        throw error;
    }
}

/**
 * Initializes account, authenticates, and places an order.
 */
export async function placeOrder(orderDetails: PlaceOrderParams): Promise<any> {
    if (
        !orderDetails.market ||
        !orderDetails.side ||
        !orderDetails.type ||
        !orderDetails.size
    ) {
        throw new Error(
            "Missing required order parameters: market, side, type, size.",
        );
    }

    const config = getParadexConfig();

    const account: Account = {
        address: process.env.PARADEX_ACCOUNT_ADDRESS,
        publicKey: process.env.PARADEX_ACCOUNT_ADDRESS,
        privateKey: process.env.PARADEX_PRIVATE_KEY,
        ethereumAccount: process.env.ETHEREUM_ACCOUNT_ADDRESS
    };

    try {
        account.jwtToken = await authenticate(config, account);
        console.log("Authenticated successfully, JWT Token received.");

        const orderResult = await placeOrderApi(config, account, orderDetails);
        return orderResult;
    } catch (err) {
        console.error("Failed to place order:", err);
        throw err;
    }
}
