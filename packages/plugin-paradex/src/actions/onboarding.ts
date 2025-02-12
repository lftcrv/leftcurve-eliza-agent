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

interface OnboardingState extends State {
    starknetAccount?: string;
    publicKey?: string;
    ethereumAccount?: string;
    networkResults?: {
        testnet?: {
            success: boolean;
            account_address?: string;
            ethereum_account?: string;
            error?: string;
        };
        prod?: {
            success: boolean;
            account_address?: string;
            ethereum_account?: string;
            error?: string;
        };
    };
}

interface OnboardingResult {
    success: boolean;
    results: Array<{
        success: boolean;
        network: string;
        account_address?: string;
        ethereum_account?: string;
        error?: string;
        details?: string;
    }>;
    error?: string;
    details?: string;
}

export class ParadexOnboardingError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexOnboardingError";
    }
}

const performOnboardingWithPython = (
    ethPrivateKey: string
): Promise<OnboardingResult> => {
    return new Promise((resolve, reject) => {
        const pluginRoot = path.resolve(__dirname, "..");
        const pythonDir = path.join(pluginRoot, "src", "python");
        const venvPath =
            process.platform === "win32"
                ? path.join(pythonDir, ".venv", "Scripts", "python.exe")
                : path.join(pythonDir, ".venv", "bin", "python3");
        const scriptPath = path.join(pythonDir, "onboarding.py");

        if (!fs.existsSync(venvPath)) {
            reject(
                new ParadexOnboardingError(
                    "Python virtual environment not found"
                )
            );
            return;
        }

        if (!fs.existsSync(scriptPath)) {
            reject(new ParadexOnboardingError("Python script not found"));
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
            if (code === 0) {
                try {
                    const result = JSON.parse(
                        stdout.trim()
                    ) as OnboardingResult;
                    resolve(result);
                } catch (e) {
                    console.error("Failed to parse Python output:", e);
                    reject(
                        new ParadexOnboardingError(
                            "Failed to parse Python script output",
                            { stdout, stderr, parseError: e }
                        )
                    );
                }
            } else {
                console.error("Python script failed");
                reject(
                    new ParadexOnboardingError("Script failed with error", {
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
                new ParadexOnboardingError(
                    `Failed to execute Python script: ${error.message}`
                )
            );
        });

        const timeout = setTimeout(() => {
            pythonProcess.kill();
            reject(new ParadexOnboardingError("Onboarding process timed out"));
        }, 30000);

        pythonProcess.on("close", () => clearTimeout(timeout));
    });
};

export const paradexOnboardingAction: Action = {
    name: "PARADEX_ONBOARDING",
    similes: ["ONBOARD_PARADEX", "SETUP_PARADEX", "INITIALIZE_PARADEX"],
    description:
        "Performs initial onboarding for a Paradex account on both testnet and mainnet",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        elizaLogger.info(
            "Starting Paradex onboarding process for all networks..."
        );

        if (!state) {
            state = await runtime.composeState(message);
        }

        const onboardingState = state as OnboardingState;
        onboardingState.networkResults = {};

        try {
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexOnboardingError(
                    "ETHEREUM_PRIVATE_KEY not set"
                );
            }

            const result = await performOnboardingWithPython(ethPrivateKey);

            if (result.success) {
                // Process results for each network
                result.results.forEach((networkResult) => {
                    const network = networkResult.network as "testnet" | "prod";
                    onboardingState.networkResults![network] = {
                        success: networkResult.success,
                        account_address: networkResult.account_address,
                        ethereum_account: networkResult.ethereum_account,
                        error: networkResult.error,
                    };

                    if (networkResult.success) {
                        elizaLogger.info(
                            `Onboarding completed successfully on ${network}:`,
                            networkResult
                        );
                    } else {
                        elizaLogger.error(
                            `Onboarding failed on ${network}:`,
                            networkResult
                        );
                    }
                });

                // Update state with the first successful account info
                const successfulResult = result.results.find((r) => r.success);
                if (successfulResult) {
                    onboardingState.starknetAccount =
                        successfulResult.account_address;
                    onboardingState.ethereumAccount =
                        successfulResult.ethereum_account;
                }

                return true;
            } else {
                elizaLogger.error("Onboarding failed on all networks:", result);
                return false;
            }
        } catch (error) {
            elizaLogger.error("Onboarding error:", error);
            if (error instanceof ParadexOnboardingError) {
                elizaLogger.error("Details:", error.details);
            }
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Setup my Paradex account" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Onboarding completed successfully on all networks.",
                    action: "PARADEX_ONBOARDING",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Initialize Paradex" },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Account onboarding successful on both testnet and mainnet.",
                    action: "PARADEX_ONBOARDING",
                },
            },
        ],
    ],
};
