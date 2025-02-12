import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

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

export class ParadexOrderError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexOrderError";
    }
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
                ORDER_PARAMS: JSON.stringify({
                    ...orderParams,
                    size: orderParams.size,
                }),
                LOGGING_LEVEL: "INFO", // Enable detailed logging
            },
        });

        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            // Log stderr output directly for debugging
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

interface ParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
    lastOrderResult?: any;
}

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
        state?: ParadexState
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as ParadexState;
        }

        try {
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexOrderError(
                    "ETHEREUM_PRIVATE_KEY environment variable not set"
                );
            }

            // Example order, need todo parse
            const orderParams: OrderParams = {
                market: "ETH-USD-PERP",
                side: "buy",
                type: "market",
                size: 0.001,
                clientId: "order-" + Date.now(),
            };

            elizaLogger.info("Placing order with params:", orderParams);
            const result = await placeOrderWithPython(
                ethPrivateKey,
                orderParams
            );
            elizaLogger.info("Order placement result:", result);

            state.lastOrderResult = result;

            if (result.error) {
                elizaLogger.error("Order placement failed:", result);
                return false;
            }

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
                content: { text: "Place a market buy order for 0.1 ETH" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Order placed successfully on Paradex.",
                    action: "PARADEX_PLACE_ORDER",
                },
            },
        ],
    ],
};
