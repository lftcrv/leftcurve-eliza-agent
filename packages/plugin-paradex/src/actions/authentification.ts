import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    UUID,
    WalletAdapter,
} from "@elizaos/core";
import {
    shortString,
    ec,
    typedData as starkTypedData,
    Account,
    RpcProvider,
} from "starknet";
import { ParadexState } from "../types";
import * as Paradex from "@paradex/sdk";

interface ParadexAuthState extends State, ParadexState {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
}

// interface OnboardingRequest {
//     public_key: string;
// }

// interface AuthResponse {
//     jwt_token: string;
// }

// interface SystemConfig {
//     apiBaseUrl: string;
//     starknet: {
//         chainId: string;
//     };
// }

// const JWT_REFRESH_THRESHOLD = 3 * 60 * 1000; // Refresh JWT 3 minutes before expiry

// // Signature functions according to Paradex impl
// function buildParadexDomain(starknetChainId: string) {
//     return {
//         name: "Paradex",
//         chainId: starknetChainId,
//         version: "1",
//     };
// }

// function buildOnboardingTypedData(starknetChainId: string) {
//     const paradexDomain = buildParadexDomain(starknetChainId);
//     return {
//         domain: paradexDomain,
//         primaryType: "Constant",
//         types: {
//             StarkNetDomain: [
//                 { name: "name", type: "felt" },
//                 { name: "chainId", type: "felt" },
//                 { name: "version", type: "felt" },
//             ],
//             Constant: [{ name: "action", type: "felt" }],
//         },
//         message: {
//             action: "Onboarding",
//         },
//     };
// }

// function buildAuthTypedData(
//     message: Record<string, unknown>,
//     starknetChainId: string
// ) {
//     const paradexDomain = buildParadexDomain(starknetChainId);
//     return {
//         domain: paradexDomain,
//         primaryType: "Request",
//         types: {
//             StarkNetDomain: [
//                 { name: "name", type: "felt" },
//                 { name: "chainId", type: "felt" },
//                 { name: "version", type: "felt" },
//             ],
//             Request: [
//                 { name: "method", type: "felt" },
//                 { name: "path", type: "felt" },
//                 { name: "body", type: "felt" },
//                 { name: "timestamp", type: "felt" },
//                 { name: "expiration", type: "felt" },
//             ],
//         },
//         message,
//     };
// }

// function signatureFromTypedData(
//     starknetAccount: string,
//     privateKey: string,
//     typedData: any
// ) {
//     const msgHash = starkTypedData.getMessageHash(typedData, starknetAccount);
//     const { r, s } = ec.starkCurve.sign(msgHash, privateKey);
//     return JSON.stringify([r.toString(), s.toString()]);
// }

export const paradexAuthAction: Action = {
    name: "PARADEX_AUTH",
    similes: ["CONNECT_PARADEX", "LOGIN_PARADEX", "AUTHENTICATE_PARADEX"],
    description: "Handles Paradex account creation and authentication",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: ParadexAuthState
    ) => {
        elizaLogger.info("Starting Paradex authentication...");

        if (!state) {
            state = (await runtime.composeState(message)) as ParadexAuthState;
        }

        try {
            const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);

            // 1. Fetch Paradex config
            const config = await Paradex.Config.fetchConfig("prod");
            elizaLogger.info("Paradex config fetched");

            // 2. Create Paraclear provider
            const paraclearProvider =
                new Paradex.ParaclearProvider.DefaultProvider(config);
            elizaLogger.info("Paraclear provider created");

            // 3. Initialize StarkNet account
            const starknetProvider = new RpcProvider({
                nodeUrl: "https://1rpc.io/starknet",
            });

            const starknetAddress = runtime.getSetting("STARKNET_ADDRESS");
            const privateKey = runtime.getSetting("STARKNET_PRIVATE_KEY");

            elizaLogger.info("starknetAddress", starknetAddress);
            elizaLogger.info("privateKey", privateKey);

            if (!starknetAddress || !privateKey) {
                throw new Error("Missing StarkNet credentials");
            }

            const baseAccount = new Account(
                starknetProvider,
                starknetAddress,
                privateKey,
                "1"
            );

            // 4. Derive Paradex account
            const paradexAccount = await Paradex.Account.fromStarknetAccount({
                provider: paraclearProvider,
                config,
                account: baseAccount,
                starknetProvider,
            });

            elizaLogger.info(
                "Paradex account derived:",
                paradexAccount.address
            );

            // Test: Get account balance
            const balance = await Paradex.Paraclear.getTokenBalance({
                config,
                provider: paraclearProvider,
                account: paradexAccount,
                token: "USDC",
            });

            elizaLogger.info("Account USDC balance:", balance.size);
        } catch (error) {
            elizaLogger.error("Paradex authentication error:", error);
            console.log("error:", error);
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
                    text: "Successfully connected to Paradex.",
                    action: "PARADEX_AUTH",
                },
            },
        ],
    ],
};
