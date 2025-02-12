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

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || "testnet").toLowerCase();
    if (network !== "testnet" && network !== "prod") {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

async function fetchAccountInfo(jwt: string, account: string) {
    const baseUrl = getParadexUrl();
    try {
        const balanceResponse = await fetch(`${baseUrl}/balance`, {
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
            },
        });
        const balanceData = await balanceResponse.json();

        const ordersResponse = await fetch(`${baseUrl}/orders`, {
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
            },
        });
        const ordersData = await ordersResponse.json();

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

export const paradexFetchAccountInfoAction: Action = {
    name: "FETCH_PARADEX_ACCOUNT",
    similes: [
        "GET_PARADEX_INFO",
        "CHECK_PARADEX_ACCOUNT",
        "VIEW_PARADEX_BALANCE",
    ],
    description:
        "Fetches Paradex account information including balance and orders",
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
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                console.error("ETHEREUM_PRIVATE_KEY not set");
                throw new ParadexAuthError(
                    "ETHEREUM_PRIVATE_KEY environment variable not set"
                );
            }

            const authResult = await getJwtToken(ethPrivateKey);

            if (!authResult.jwt_token) {
                console.error("No JWT token in result:", authResult);
                throw new ParadexAuthError("Failed to get JWT token");
            }
            console.log("authResult", authResult);

            state.jwtToken = authResult.jwt_token;
            state.jwtExpiry = authResult.expiry;
            state.starknetAccount = authResult.account_address;

            const accountInfo = await fetchAccountInfo(
                authResult.jwt_token,
                authResult.account_address
            );

            state.accountBalance = accountInfo.balance;
            state.accountOrders = accountInfo.orders;

            elizaLogger.info("AccountBalance:", accountInfo.balance);
            elizaLogger.info("accountOrders:", accountInfo.orders);
            elizaLogger.success("Successfully fetched account information");

            return true;
        } catch (error) {
            console.error("Account Info fetch error:", error);
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
                content: { text: "What's my Paradex balance?" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I've retrieved your Paradex account information and balance.",
                    action: "FETCH_PARADEX_ACCOUNT",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Show me my Paradex orders" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Here is your current Paradex account information including orders.",
                    action: "FETCH_PARADEX_ACCOUNT",
                },
            },
        ],
    ],
};
