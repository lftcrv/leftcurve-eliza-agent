import {
    Provider,
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

interface BalanceResult {
    token: string;
    size: string;
    last_updated_at: number;
}

interface BalanceResponse {
    results: BalanceResult[];
}

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || "testnet").toLowerCase();
    if (network !== "testnet" && network !== "prod") {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

async function fetchAccountBalance(
    jwt: string,
    account: string
): Promise<BalanceResponse> {
    const baseUrl = getParadexUrl();
    try {
        const balanceResponse = await fetch(`${baseUrl}/balance`, {
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
            },
        });
        return await balanceResponse.json();
    } catch (error) {
        console.error("Error fetching account balance:", error);
        throw new ParadexAuthError("Failed to fetch account balance", error);
    }
}

export const paradexBalanceProvider: Provider = {
    get: async (
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
            state.jwtToken = authResult.jwt_token;
            state.jwtExpiry = authResult.expiry;
            state.starknetAccount = authResult.account_address;

            const balance = await fetchAccountBalance(
                authResult.jwt_token,
                authResult.account_address
            );

            if (!balance.results || balance.results.length === 0) {
                return "No balance information available.";
            }

            const formattedBalances = balance.results
                .map((bal: BalanceResult) => {
                    const size = parseFloat(bal.size).toFixed(4);
                    return `${bal.token}: ${size}`;
                })
                .join("\n");

            return `Current Balances:\n${formattedBalances}`;
        } catch (error) {
            console.error("Balance fetch error:", error);
            if (error instanceof ParadexAuthError) {
                console.error("Details:", error.details);
            }
            return "Unable to fetch balance. Please try again later.";
        }
    },
};
