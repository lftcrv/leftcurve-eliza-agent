import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    UUID,
    WalletAdapter,
} from "@elizaos/core";
import { shortString, ec, typedData as starkTypedData } from "starknet";
import { ParadexState } from "../types";

interface ParadexAuthState extends State, ParadexState {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
}

interface OnboardingRequest {
    public_key: string;
}

interface AuthResponse {
    jwt_token: string;
}

interface SystemConfig {
    apiBaseUrl: string;
    starknet: {
        chainId: string;
    };
}

const JWT_REFRESH_THRESHOLD = 3 * 60 * 1000; // Refresh JWT 3 minutes before expiry

// Signature functions according to Paradex impl
function buildParadexDomain(starknetChainId: string) {
    return {
        name: "Paradex",
        chainId: starknetChainId,
        version: "1",
    };
}

function buildOnboardingTypedData(starknetChainId: string) {
    const paradexDomain = buildParadexDomain(starknetChainId);
    return {
        domain: paradexDomain,
        primaryType: "Constant",
        types: {
            StarkNetDomain: [
                { name: "name", type: "felt" },
                { name: "chainId", type: "felt" },
                { name: "version", type: "felt" },
            ],
            Constant: [{ name: "action", type: "felt" }],
        },
        message: {
            action: "Onboarding",
        },
    };
}

function buildAuthTypedData(
    message: Record<string, unknown>,
    starknetChainId: string
) {
    const paradexDomain = buildParadexDomain(starknetChainId);
    return {
        domain: paradexDomain,
        primaryType: "Request",
        types: {
            StarkNetDomain: [
                { name: "name", type: "felt" },
                { name: "chainId", type: "felt" },
                { name: "version", type: "felt" },
            ],
            Request: [
                { name: "method", type: "felt" },
                { name: "path", type: "felt" },
                { name: "body", type: "felt" },
                { name: "timestamp", type: "felt" },
                { name: "expiration", type: "felt" },
            ],
        },
        message,
    };
}

function signatureFromTypedData(
    starknetAccount: string,
    privateKey: string,
    typedData: any
) {
    const msgHash = starkTypedData.getMessageHash(typedData, starknetAccount);
    const { r, s } = ec.starkCurve.sign(msgHash, privateKey);
    return JSON.stringify([r.toString(), s.toString()]);
}

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

            const config: SystemConfig = {
                apiBaseUrl: "https://api.testnet.paradex.trade/v1",
                starknet: {
                    chainId: shortString.encodeShortString(
                        "PRIVATE_SN_POTC_SEPOLIA"
                    ),
                },
            };

            const starknetAccount = runtime.getSetting("STARKNET_ADDRESS");
            const privateKey = runtime.getSetting("STARKNET_PRIVATE_KEY");
            const publicKey = privateKey
                ? "0x" +
                  Array.from(ec.starkCurve.getPublicKey(privateKey))
                      .slice(1, 33)
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("")
                : undefined;

            elizaLogger.info("starknetAccount", starknetAccount);
            elizaLogger.info("privateKey", privateKey);
            elizaLogger.info("publicKey", publicKey);
            if (!starknetAccount || !privateKey) {
                elizaLogger.error(
                    "Missing credentials. Need STARKNET_ADDRESS, STARKNET_PRIVATE_KEY"
                );
                return false;
            }
            // const authInfo = await walletAdapter.getParadexAuth(message.userId);
            const authInfo = false;

            // if (!authInfo || !authInfo.is_onboarded) {
            if (!authInfo) {
                elizaLogger.info(
                    "User not onboarded, starting onboarding process..."
                );

                // Generate signature for onboarding
                const onboardingTypedData = buildOnboardingTypedData(
                    config.starknet.chainId
                );
                elizaLogger.info("onboardingTypedData", onboardingTypedData);
                const onboardingSignature = signatureFromTypedData(
                    starknetAccount,
                    privateKey,
                    onboardingTypedData
                );
                elizaLogger.info("onboardingSignature", onboardingSignature);

                const timestamp = Math.floor(Date.now() / 1000);
                const fakeParentAccount = starknetAccount.slice(0, -1) + "e";

                const onboardingResponse = await fetch(
                    `${config.apiBaseUrl}/onboarding`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json",
                            "PARADEX-PARENT-ACCOUNT": `strk:${fakeParentAccount}`,
                            "PARADEX-STARKNET-ACCOUNT": starknetAccount,
                            "PARADEX-STARKNET-SIGNATURE": onboardingSignature,
                            "PARADEX-TIMESTAMP": timestamp.toString(),
                        },
                        body: JSON.stringify({ public_key: publicKey }),
                    }
                );
                if (onboardingResponse.status !== 200) {
                    const errorData = await onboardingResponse.text();
                    elizaLogger.error(
                        "Onboarding failed with response:",
                        errorData
                    );
                    throw new Error(
                        `Onboarding failed: ${onboardingResponse.statusText}`
                    );
                }

                elizaLogger.success("Onboarding completed successfully");

                // await walletAdapter.upsertParadexAuth({
                //     user_id: message.userId,
                //     is_onboarded: true,
                //     starknet_account: starknetAccount,
                //     public_key: publicKey,
                // });

                elizaLogger.success("Onboarding completed successfully");
            }

            const currentTime = Date.now();
            if (
                // !authInfo?.jwt ||
                // !authInfo?.jwt_expiration ||
                // currentTime > authInfo.jwt_expiration - JWT_REFRESH_THRESHOLD
                true
            ) {
                elizaLogger.info("Generating new JWT token...");
                const timestamp = Math.floor(Date.now() / 1000);
                const expiration = timestamp + 1800; // 30 minutes

                const authMessage = {
                    method: "POST",
                    path: "/v1/auth",
                    body: "",
                    timestamp,
                    expiration,
                };
                console.log("authmessage:", authMessage);

                const authTypedData = buildAuthTypedData(
                    authMessage,
                    config.starknet.chainId
                );
                console.log("authTypedData:", authTypedData);

                const authSignature = signatureFromTypedData(
                    starknetAccount,
                    privateKey,
                    authTypedData
                );
                console.log("authSignature:", authSignature);

                const authResponse = await fetch(`${config.apiBaseUrl}/auth`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "PARADEX-STARKNET-ACCOUNT": starknetAccount,
                        "PARADEX-STARKNET-SIGNATURE": authSignature,
                        "PARADEX-TIMESTAMP": timestamp.toString(),
                        "PARADEX-SIGNATURE-EXPIRATION": expiration.toString(),
                    },
                });
                console.log("authResponse:", authResponse);

                if (authResponse.status !== 200) {
                    const errorData = await authResponse.text();
                    throw new Error(`Authentication failed: ${errorData}`);
                }

                const authData = await authResponse.json();
                if (!authData?.jwt_token) {
                    throw new Error("No JWT token in response");
                }

                // await walletAdapter.upsertParadexAuth({
                //     user_id: message.userId,
                //     jwt: authData.jwt_token,
                //     jwt_expiration: currentTime + 5 * 60 * 1000,
                //     starknet_account: starknetAccount,
                //     public_key: publicKey,
                //     is_onboarded: true,
                // });

                elizaLogger.success("JWT generated and stored successfully");

                // Test API call - Get account info
                const accountResponse = await fetch(
                    `${config.apiBaseUrl}/account`,
                    {
                        headers: {
                            Accept: "application/json",
                            Authorization: `Bearer ${authData.jwt_token}`,
                        },
                    }
                );
                console.log("accountResponse:", accountResponse);

                if (accountResponse.status === 200) {
                    const accountInfo = await accountResponse.json();
                    elizaLogger.info(
                        "Account info retrieved successfully:",
                        accountInfo
                    );
                } else {
                    elizaLogger.error(
                        "Failed to get account info:",
                        await accountResponse.text()
                    );
                }
            }
            return true;
        } catch (error) {
            elizaLogger.error("Paradex authentication error:", error);
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

// Helper function to check authentication status
// export const isAuthenticated = async (
//     runtime: IAgentRuntime,
//     userId: UUID,
//     state?: ParadexAuthState
// ): Promise<boolean> => {
//     try {
//         const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);
//         const authInfo = await walletAdapter.getParadexAuth(userId);
//         return !!(
//             authInfo?.jwt &&
//             authInfo?.jwt_expiration &&
//             Date.now() < authInfo.jwt_expiration - JWT_REFRESH_THRESHOLD
//         );
//     } catch (error) {
//         elizaLogger.error("Error checking authentication status:", error);
//         return false;
//     }
// };
