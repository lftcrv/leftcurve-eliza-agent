import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { Account, SystemConfig } from "../utils/paradex-ts/types";
import { authenticate } from "../utils/paradex-ts/api";
import { getParadexConfig, getAccount, ParadexAuthenticationError } from "../utils/paradexUtils";

interface ParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
    accountBalance?: string;
    accountOrders?: any[];
}
async function fetchAccountInfo(config: SystemConfig, account: Account) {
    try {
        const balanceResponse = await fetch(`${config.apiBaseUrl}/balance`, {
            headers: {
                Authorization: `Bearer ${account.jwtToken}`,
                Accept: "application/json",
            },
        });
        const balanceData = await balanceResponse.json();

        const ordersResponse = await fetch(`${config.apiBaseUrl}/orders`, {
            headers: {
                Authorization: `Bearer ${account.jwtToken}`,
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
        state?: ParadexState,
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as ParadexState;
        }

        try {
            // Get account and config
            const account = await getAccount(runtime);
            const config = getParadexConfig();

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

            const accountInfo = await fetchAccountInfo(config, account);

            state.accountBalance = accountInfo.balance;
            state.accountOrders = accountInfo.orders;

            return true;
        } catch (error) {
            console.error("Account Info fetch error:", error);

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
