import { shortString } from "starknet";
import { SystemConfig, Account } from "./paradex-ts/types";
import { IAgentRuntime, State, elizaLogger } from "@elizaos/core";
import { ParadexOrderError } from "../actions/placeOrder";
import { validateParadexConfig } from "../environment";


export function getParadexConfig(): SystemConfig {
    const network = process.env.PARADEX_NETWORK?.toLowerCase();

    let apiBaseUrl: string;
    let chainId: string;

    if (network === "prod") {
        apiBaseUrl = "https://api.prod.paradex.trade/v1";
        chainId = shortString.encodeShortString("PRIVATE_SN_PARACLEAR_MAINNET");
    } else if (network === "testnet") {
        apiBaseUrl = "https://api.testnet.paradex.trade/v1";
        chainId = shortString.encodeShortString("PRIVATE_SN_POTC_SEPOLIA");
    } else {
        throw new Error(
            "Invalid PARADEX_NETWORK. Please set it to 'prod' or 'testnet'."
        );
    }

    return { apiBaseUrl, starknet: { chainId } };
}

export async function initializeAccount(
    runtime: IAgentRuntime
): Promise<Account> {
    try {
        const config = await validateParadexConfig(runtime);
        return {
            address: config.PARADEX_ACCOUNT_ADDRESS,
            publicKey: config.PARADEX_ACCOUNT_ADDRESS,
            privateKey: config.PARADEX_PRIVATE_KEY,
            ethereumAccount: config.ETHEREUM_ACCOUNT_ADDRESS,
        };
    } catch (error) {
        elizaLogger.error("Failed to initialize account:", error);
        throw new ParadexOrderError(
            "Failed to initialize account configuration"
        );
    }
}

export class ParadexAuthenticationError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexAuthenticationError";
    }
}

export interface BaseParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
}
