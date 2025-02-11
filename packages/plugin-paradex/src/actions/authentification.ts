import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { getJwtToken, ParadexAuthError } from "../utils/getJwtParadex";

interface ParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
    accountBalance?: string;
    accountOrders?: any[];
}

async function fetchAccountInfo(jwt: string, account: string) {
    try {
        // Fetch account balance
        const balanceResponse = await fetch(
            `https://api.prod.paradex.trade/v1/balance`,
            {
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    Accept: "application/json",
                },
            }
        );
        const balanceData = await balanceResponse.json();

        // Fetch open orders
        const ordersResponse = await fetch(
            `https://api.prod.paradex.trade/v1/orders`,
            {
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    Accept: "application/json",
                },
            }
        );
        const ordersData = await ordersResponse.json();
        console.log("ordersData", ordersData);

        elizaLogger.success("ordersData", ordersData);

        return {
            balance: balanceData,
            orders: ordersData,
        };
    } catch (error) {
        console.error("Error fetching account info:", error);
        throw new ParadexAuthError(
            "Failed to fetch account information",
            error
        );
    }
}

export const paradexAuthAction: Action = {
    name: "PARADEX_AUTH",
    similes: ["CONNECT_PARADEX", "LOGIN_PARADEX", "AUTHENTICATE_PARADEX"],
    description:
        "Handles Paradex account authentication and fetches account information",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: ParadexState
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as ParadexState;
        }

        try {
            // 1. Get environment variables
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                console.error("ETHEREUM_PRIVATE_KEY not set");
                throw new ParadexAuthError(
                    "ETHEREUM_PRIVATE_KEY environment variable not set"
                );
            }

            // 2. Get JWT token
            const authResult = await getJwtToken(ethPrivateKey);

            if (!authResult.jwt_token) {
                console.error("No JWT token in result:", authResult);
                throw new ParadexAuthError("Failed to get JWT token");
            }
            console.log("authResult", authResult);

            // 3. Update state with auth info
            state.jwtToken = authResult.jwt_token;
            state.jwtExpiry = authResult.expiry;
            state.starknetAccount = authResult.account_address;

            // 4. Fetch account information
            const accountInfo = await fetchAccountInfo(
                authResult.jwt_token,
                authResult.account_address
            );
            console.log("acciuntInfo:", accountInfo);

            // 5. Update state with account info
            state.accountBalance = accountInfo.balance;
            state.accountOrders = accountInfo.orders;

            console.log("Successfully authenticated and fetched account info");

            return true;
        } catch (error) {
            console.error("Authentication/Account Info error:", error);
            if (error instanceof ParadexAuthError) {
                console.error("Details:", error.details);
            }

            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Connect my Paradex account" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Successfully connected to Paradex and fetched account information.",
                    action: "PARADEX_AUTH",
                },
            },
        ],
    ],
};
