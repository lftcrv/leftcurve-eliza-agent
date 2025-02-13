import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    generateObjectDeprecated,
    ModelClass,
    composeContext,
    elizaLogger,
} from "@elizaos/core";
import { getJwtToken, ParadexAuthError } from "../utils/getJwtParadex";
import { ParadexState } from "../types";
import { sendTradingInfo } from "./placeOrder";

interface CancelOrderState extends State, ParadexState {
    lastMessage?: string;
    lastOrderId?: string;
}

interface CancelOrderRequest {
    orderId: string;
}

const cancelOrderTemplate = `Analyze ONLY the latest user message to extract the order ID to cancel.
Last message: "{{lastMessage}}"

The order ID should be extracted from the message.
Examples of valid messages:
- "Cancel order 1389374042600201783749284920"
- "Remove order 1723728042600201727492050274"
- "Cancel       1380374042600201703991150000"

Respond with a JSON markdown block containing ONLY the order ID from the last message:
\`\`\`json
{
  "orderId": "1738437810829483947293473202"
}
\`\`\`
`;

export class ParadexCancelError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexCancelError";
    }
}

async function cancelOrder(jwt: string, orderId: string): Promise<boolean> {
    const network = (process.env.PARADEX_NETWORK || "testnet").toLowerCase();
    if (network !== "testnet" && network !== "prod") {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    const baseUrl = `https://api.${network}.paradex.trade/v1`;

    try {
        const response = await fetch(`${baseUrl}/orders/${orderId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
            },
        });

        if (response.status === 204) {
            elizaLogger.success(`Successfully cancelled order ${orderId}`);
            return true;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new ParadexCancelError(
                `Failed to cancel order: ${response.status} ${response.statusText}`,
                errorData
            );
        }

        return false;
    } catch (error) {
        elizaLogger.error(`Error cancelling order ${orderId}:`, error);
        throw new ParadexCancelError(
            "Failed to cancel order",
            error instanceof Error ? error.message : error
        );
    }
}

export const paradexCancelOrderAction: Action = {
    name: "CANCEL_PARADEX_ORDER",
    similes: ["CANCEL_ORDER", "REMOVE_ORDER", "DELETE_ORDER"],
    description: "Cancels a specific order on Paradex",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content?.text?.toLowerCase() || "";
        return text.includes("cancel") && text.includes("order");
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: CancelOrderState
    ) => {
        elizaLogger.info("Starting cancel order process...");

        if (!state) {
            state = (await runtime.composeState(message)) as CancelOrderState;
            elizaLogger.success("State composed");
        }

        try {
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexCancelError("ETHEREUM_PRIVATE_KEY not set");
            }

            const CONTAINER_ID = process.env.CONTAINER_ID;
            if (!CONTAINER_ID) {
                throw new ParadexCancelError("CONTAINER_ID not set");
            }

            // Parse message to extract order ID
            state.lastMessage = message.content.text;

            const context = composeContext({
                state,
                template: cancelOrderTemplate,
            });

            const response = (await generateObjectDeprecated({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
            })) as CancelOrderRequest;

            if (!response.orderId) {
                elizaLogger.warn("No order ID found in response");
                return false;
            }

            elizaLogger.success("Model response:", response);

            // Save order ID in state
            state.lastOrderId = response.orderId;

            // Get JWT token
            const authResult = await getJwtToken(ethPrivateKey);
            if (!authResult.jwt_token) {
                throw new ParadexCancelError("Failed to get JWT token");
            }

            // Update state with JWT info
            state.jwtToken = authResult.jwt_token;
            state.jwtExpiry = authResult.expiry;
            state.starknetAccount = authResult.account_address;

            elizaLogger.info(
                "Obtained JWT token, proceeding with order cancellation"
            );

            const success = await cancelOrder(
                authResult.jwt_token,
                response.orderId
            );

            if (success) {
                elizaLogger.success(
                    `Order ${response.orderId} cancelled successfully`
                );

                const tradeObject = {
                    tradeId: response.orderId,
                    containerId: CONTAINER_ID,
                    trade: {
                        orderId: response.orderId,
                        action: "cancel",
                        timestamp: Date.now(),
                    },
                };

                const tradingInfoDto = {
                    runtimeAgentId: state.agentId,
                    information: tradeObject,
                };

                await sendTradingInfo(
                    tradingInfoDto,
                    process.env.BACKEND_PORT,
                    process.env.BACKEND_API_KEY
                );

                return true;
            } else {
                elizaLogger.warn(`Failed to cancel order ${response.orderId}`);
                return false;
            }
        } catch (error) {
            elizaLogger.error("Cancel order error:", error);
            if (error instanceof ParadexCancelError) {
                elizaLogger.error("Cancel Details:", error.details);
            }
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Cancel order abc123" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Order cancelled successfully.",
                    action: "CANCEL_PARADEX_ORDER",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Please remove order: xyz789" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Order cancelled.",
                    action: "CANCEL_PARADEX_ORDER",
                },
            },
        ],
    ],
};
