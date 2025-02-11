import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { spawn } from "child_process";
import path from "path";

interface ParadexState extends State {
    starknetAccount?: string;
    publicKey?: string;
    lastMessage?: string;
    jwtToken?: string;
    jwtExpiry?: number;
}

interface AuthResponse {
    jwt_token: string;
    expiry: number;
    account_address: string;
    error?: string;
}

class ParadexAuthError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexAuthError";
    }
}

const getVenvPythonPath = () => {
    // Check if we're on Windows
    const isWindows = process.platform === "win32";

    // Get the plugin's src directory
    const srcDir = path.resolve(__dirname);
    // Go up one level to get to the plugin root
    const pluginDir = path.resolve(srcDir, "..");

    // Construct the path to the Python executable in the virtual environment
    const venvPath = isWindows
        ? path.join(pluginDir, ".venv", "Scripts", "python.exe")
        : path.join(pluginDir, ".venv", "bin", "python3");

    return venvPath;
};

const getJwtToken = (ethPrivateKey: string): Promise<AuthResponse> => {
    return new Promise((resolve, reject) => {
        const pythonPath = getVenvPythonPath();
        // Path to your Python script relative to the src directory
        const scriptPath = path.join(__dirname, "onboarding.py");

        let stdout = "";
        let stderr = "";

        const pythonProcess = spawn(pythonPath, [scriptPath], {
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                PYTHONPATH: path.resolve(__dirname), // Set to src directory
                ETHEREUM_PRIVATE_KEY: ethPrivateKey, // Pass private key as env var
            },
        });

        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            stderr += data.toString();
            // Log stderr in real-time for debugging
            elizaLogger.debug("Python stderr:", stderr);
        });

        pythonProcess.on("close", (code) => {
            if (code === 0 && stdout) {
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    reject(
                        new ParadexAuthError(
                            "Failed to parse Python script output",
                            { stdout, stderr }
                        )
                    );
                }
            } else {
                try {
                    const error = stderr
                        ? JSON.parse(stderr)
                        : { error: "Unknown error occurred" };
                    reject(new ParadexAuthError(error.error, error));
                } catch (e) {
                    reject(
                        new ParadexAuthError(
                            stderr || "Script failed with no error message"
                        )
                    );
                }
            }
        });

        pythonProcess.on("error", (error) => {
            elizaLogger.error("Python process error:", error);
            reject(
                new ParadexAuthError(
                    `Failed to execute Python script: ${error.message}`,
                    error
                )
            );
        });

        // Set a timeout
        const timeout = setTimeout(() => {
            pythonProcess.kill();
            reject(new ParadexAuthError("Authentication timed out"));
        }, 30000); // 30 seconds timeout

        pythonProcess.on("close", () => clearTimeout(timeout));
    });
};

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
        state?: ParadexState
    ) => {
        elizaLogger.info("Starting Paradex authentication...");

        if (!state) {
            state = (await runtime.composeState(message)) as ParadexState;
        }

        try {
            // Get private key from secure environment variable
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexAuthError(
                    "ETHEREUM_PRIVATE_KEY environment variable not set"
                );
            }

            // Execute Python script
            const result = await getJwtToken(ethPrivateKey);

            if (result.jwt_token) {
                state.jwtToken = result.jwt_token;
                state.jwtExpiry = result.expiry;
                state.starknetAccount = result.account_address;
                elizaLogger.info("Successfully obtained JWT token");

                // // Schedule token refresh before expiry (5 minutes before)
                // const refreshTime =
                //     result.expiry * 1000 - Date.now() - 5 * 60 * 1000;
                // if (refreshTime > 0) {
                //     setTimeout(() => {
                //         void runtime.processAction(
                //             "PARADEX_AUTH",
                //             message,
                //             state
                //         );
                //     }, refreshTime);
                // }

                return true;
            } else {
                throw new ParadexAuthError(
                    "Failed to get JWT token from Python script"
                );
            }
        } catch (error) {
            if (error instanceof ParadexAuthError) {
                elizaLogger.error(
                    "Paradex authentication error:",
                    error.message,
                    error.details
                );
            } else {
                elizaLogger.error(
                    "Unexpected error during Paradex authentication:",
                    error
                );
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
                    text: "Successfully connected to Paradex.",
                    action: "PARADEX_AUTH",
                },
            },
        ],
    ],
};
