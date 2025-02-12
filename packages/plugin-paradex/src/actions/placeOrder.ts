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
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

interface ParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
    lastOrderResult?: any;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OrderParams {
    market: string;
    side: "buy" | "sell";
    type: "market" | "limit";
    size: number;
    price?: number;
    clientId?: string;
}

interface PlaceOrderState extends State, ParadexState {
    marketsInfo?: string;
    lastMessage?: string;
}

interface OrderRequest {
    action: "long" | "short" | "buy" | "sell";
    market: string;
    size: number;
    price?: number; // Optional - if present, becomes a limit order
}

const orderTemplate = `Available markets: {{marketsInfo}}

Analyze ONLY the latest user message to extract order details.
Last message: "{{lastMessage}}"

Rules:
1. ALL markets MUST be formatted as CRYPTO-USD-PERP (e.g., "BTC-USD-PERP", "ETH-USD-PERP")
2. If only the crypto name is given (e.g., "ETH" or "BTC"), append "-USD-PERP"
3. Size must be a number
4. Price is optional - if specified, creates a limit order

Examples of valid messages and their parsing:
- "Long 0.1 ETH" → market: "ETH-USD-PERP"
- "Short 0.5 BTC at 96000" → market: "BTC-USD-PERP"
- "Buy 1000 USDC worth of ETH" → market: "ETH-USD-PERP"
- "Sell 0.2 ETH at 5000" → market: "ETH-USD-PERP"

Respond with a JSON markdown block containing ONLY the order details:
\`\`\`json
{
  "action": "long",
  "market": "ETH-USD-PERP",  // Must always be CRYPTO-USD-PERP format
  "size": 0.1
}
\`\`\`

Or for a limit order:
\`\`\`json
{
  "action": "short",
  "market": "BTC-USD-PERP",  // Must always be CRYPTO-USD-PERP format
  "size": 0.5,
  "price": 96000
}
\`\`\``;

function standardizeMarket(market: string): string {
    // Remove any existing -USD-PERP suffix to avoid duplication
    const baseCrypto = market.split("-")[0];
    return `${baseCrypto}-USD-PERP`;
}

export class ParadexOrderError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexOrderError";
    }
}

function convertToOrderParams(request: OrderRequest): OrderParams {
    // Convert long/short to buy/sell
    let side: "buy" | "sell";
    if (request.action === "long" || request.action === "buy") {
        side = "buy";
    } else {
        side = "sell";
    }

    return {
        market: standardizeMarket(request.market),
        side,
        type: request.price ? "limit" : "market",
        size: request.size,
        price: request.price,
        clientId: `order-${Date.now()}`,
    };
}

const placeOrderWithPython = (
    ethPrivateKey: string,
    orderParams: OrderParams
): Promise<any> => {
    return new Promise((resolve, reject) => {
        const pluginRoot = path.resolve(__dirname, "..");
        const pythonDir = path.join(pluginRoot, "src", "python");
        const venvPath =
            process.platform === "win32"
                ? path.join(pythonDir, ".venv", "Scripts", "python.exe")
                : path.join(pythonDir, ".venv", "bin", "python3");
        const scriptPath = path.join(pythonDir, "place_order.py");

        if (!fs.existsSync(venvPath)) {
            reject(
                new ParadexOrderError("Python virtual environment not found")
            );
            return;
        }

        if (!fs.existsSync(scriptPath)) {
            reject(new ParadexOrderError("Python script not found"));
            return;
        }

        let stdout = "";
        let stderr = "";

        const pythonProcess = spawn(venvPath, [scriptPath], {
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                PYTHONPATH: pythonDir,
                ETHEREUM_PRIVATE_KEY: ethPrivateKey,
                ORDER_PARAMS: JSON.stringify(orderParams),
                LOGGING_LEVEL: "INFO",
            },
        });

        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            elizaLogger.debug("Python stderr:", data.toString());
            stderr += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code === 0 && stdout) {
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    console.error("Failed to parse Python output:", e);
                    reject(
                        new ParadexOrderError(
                            "Failed to parse Python script output",
                            { stdout, stderr, parseError: e }
                        )
                    );
                }
            } else {
                console.error("Python script failed");
                reject(
                    new ParadexOrderError("Script failed with error", {
                        stdout,
                        stderr,
                        code,
                    })
                );
            }
        });

        pythonProcess.on("error", (error) => {
            console.error("Failed to start Python process:", error);
            reject(
                new ParadexOrderError(
                    `Failed to execute Python script: ${error.message}`
                )
            );
        });

        const timeout = setTimeout(() => {
            pythonProcess.kill();
            reject(new ParadexOrderError("Order placement timed out"));
        }, 30000);

        pythonProcess.on("close", () => clearTimeout(timeout));
    });
};

export const paradexPlaceOrderAction: Action = {
    name: "PARADEX_PLACE_ORDER",
    similes: ["PLACE_ORDER", "SUBMIT_ORDER", "CREATE_ORDER"],
    description: "Places an order on Paradex",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: PlaceOrderState
    ) => {
        elizaLogger.info("Starting order placement...");
        if (!state) {
            elizaLogger.info("Composing state...");
            state = (await runtime.composeState(message)) as PlaceOrderState;
            elizaLogger.success("State composed");
        }

        try {
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexOrderError("ETHEREUM_PRIVATE_KEY not set");
            }

            state.lastMessage = message.content.text;

            elizaLogger.info("Generating response from user request...");
            const context = composeContext({
                state,
                template: orderTemplate,
            });

            elizaLogger.info("Context generated, calling model...");
            const request = (await generateObjectDeprecated({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
            })) as OrderRequest;

            if (!request.market || !request.size || !request.action) {
                elizaLogger.warn(
                    "Invalid or incomplete order request:",
                    request
                );
                return false;
            }

            elizaLogger.success("Model response:", request);

            const orderParams = convertToOrderParams(request);

            const result = await placeOrderWithPython(
                ethPrivateKey,
                orderParams
            );

            if (result.error) {
                elizaLogger.error("Order placement failed:", result);
                return false;
            }

            state.lastOrderResult = result;
            elizaLogger.success("Order placed successfully:", result);
            return true;
        } catch (error) {
            elizaLogger.error("Order placement error:", error);
            if (error instanceof ParadexOrderError) {
                elizaLogger.error("Details:", error.details);
            }
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Long 0.1 ETH" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Market long order placed for ETH-USD-PERP.",
                    action: "PARADEX_PLACE_ORDER",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Short 0.05 BTC at 96000" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Limit short order placed for BTC-USD-PERP.",
                    action: "PARADEX_PLACE_ORDER",
                },
            },
        ],
    ],
};
