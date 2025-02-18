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

// Enhanced logging function
const debugLog = (context: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [PARADEX-DEBUG] [${context}] ${message}`;
    elizaLogger.log(logMessage);
    if (data) {
        elizaLogger.log(
            "[PARADEX-DEBUG-DATA]",
            JSON.stringify(data, null, 2)
        );
    }
};

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
        debugLog("ERROR", message, details);
    }
}

const getPythonExecutable = () => {
    debugLog("SETUP", "Getting Python executable path");
    const pluginRoot = path.resolve(__dirname, "..");
    const pythonDir = path.join(pluginRoot, "src", "python");
    const venvBinPath =
        process.platform === "win32"
            ? path.join(".venv", "Scripts", "python.exe")
            : path.join(".venv", "bin", "python3");
    const fullPath = path.join(pythonDir, venvBinPath);
    debugLog("SETUP", `Python executable path: ${fullPath}`);
    return fullPath;
};

const validatePythonSetup = () => {
    debugLog("VALIDATION", "Starting Python setup validation");

    const pythonPath = getPythonExecutable();
    const pluginRoot = path.resolve(__dirname, "..");
    const pythonDir = path.join(pluginRoot, "src", "python");
    const scriptPath = path.join(pythonDir, "onboarding.py");

    debugLog("VALIDATION", "Checking paths", {
        pythonPath,
        pluginRoot,
        pythonDir,
        scriptPath,
    });

    // Check if Python virtual environment exists
    if (!fs.existsSync(pythonPath)) {
        const error = `Python virtual environment not found at: ${pythonPath}`;
        debugLog("VALIDATION", "Virtual environment check failed", {
            error,
            exists: false,
            path: pythonPath,
        });
        throw new ParadexOnboardingError(error);
    }

    // Check if Python script exists
    if (!fs.existsSync(scriptPath)) {
        const error = `Python script not found at: ${scriptPath}`;
        debugLog("VALIDATION", "Script check failed", {
            error,
            exists: false,
            path: scriptPath,
        });
        throw new ParadexOnboardingError(error);
    }

    debugLog("VALIDATION", "Python setup validation successful", {
        pythonPath,
        scriptPath,
        pythonDir,
    });

    return { pythonPath, scriptPath, pythonDir };
};

const performOnboardingWithPython = (
    ethPrivateKey: string
): Promise<OnboardingResult> => {
    debugLog("ONBOARDING", "Starting Python onboarding process");

    return new Promise((resolve, reject) => {
        try {
            const { pythonPath, scriptPath, pythonDir } = validatePythonSetup();
            let stdout = "";
            let stderr = "";

            debugLog("ONBOARDING", "Spawning Python process", {
                pythonPath,
                scriptPath,
                pythonDir,
            });

            const pythonProcess = spawn(pythonPath, [scriptPath], {
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: "1",
                    PYTHONPATH: pythonDir,
                    ETHEREUM_PRIVATE_KEY: ethPrivateKey,
                    LOGGING_LEVEL: "DEBUG", // Set to DEBUG for more verbose Python logs
                    VIRTUAL_ENV: path.dirname(path.dirname(pythonPath)),
                    PATH: `${path.dirname(pythonPath)}:${process.env.PATH}`,
                },
            });

            debugLog("ONBOARDING", "Python process spawned", {
                pid: pythonProcess.pid,
            });

            pythonProcess.stdout.on("data", (data) => {
                const output = data.toString();
                stdout += output;
                debugLog("PYTHON-STDOUT", output.trim());
            });

            pythonProcess.stderr.on("data", (data) => {
                const output = data.toString();
                stderr += output;
                debugLog("PYTHON-STDERR", output.trim());
            });

            pythonProcess.on("close", (code) => {
                debugLog(
                    "ONBOARDING",
                    `Python process closed with code ${code}`,
                    {
                        exitCode: code,
                    }
                );

                if (code === 0) {
                    try {
                        const result = JSON.parse(
                            stdout.trim()
                        ) as OnboardingResult;
                        debugLog(
                            "ONBOARDING",
                            "Onboarding result parsed successfully",
                            result
                        );
                        resolve(result);
                    } catch (e) {
                        const error = new ParadexOnboardingError(
                            "Failed to parse Python script output",
                            { stdout, stderr, parseError: e }
                        );
                        reject(error);
                    }
                } else {
                    const error = new ParadexOnboardingError(
                        "Script failed with error",
                        {
                            stdout,
                            stderr,
                            code,
                        }
                    );
                    reject(error);
                }
            });

            pythonProcess.on("error", (error) => {
                debugLog("ONBOARDING", "Python process error", {
                    error: error.message,
                    stack: error.stack,
                });
                reject(
                    new ParadexOnboardingError(
                        `Failed to execute Python script: ${error.message}`,
                        error
                    )
                );
            });

            const timeout = setTimeout(() => {
                debugLog(
                    "ONBOARDING",
                    "Process timeout reached, killing Python process"
                );
                pythonProcess.kill();
                reject(
                    new ParadexOnboardingError(
                        "Onboarding process timed out after 30s"
                    )
                );
            }, 30000);

            pythonProcess.on("close", () => {
                debugLog("ONBOARDING", "Clearing timeout");
                clearTimeout(timeout);
            });
        } catch (error) {
            debugLog("ONBOARDING", "Unexpected error in onboarding process", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            reject(error);
        }
    });
};

export const paradexOnboardingAction: Action = {
    name: "PARADEX_ONBOARDING",
    similes: ["ONBOARD_PARADEX", "SETUP_PARADEX", "INITIALIZE_PARADEX"],
    description:
        "Performs initial onboarding for a Paradex account on both testnet and mainnet",
    suppressInitialMessage: true,

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        debugLog("ACTION", "Validating onboarding action");
        const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;

        if (!ethPrivateKey) {
            debugLog(
                "ACTION",
                "Validation failed: ETHEREUM_PRIVATE_KEY not set"
            );
            return false;
        }

        debugLog("ACTION", "Validation successful");
        return true;
    },

    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        debugLog("ACTION", "Starting Paradex onboarding handler");

        if (!state) {
            debugLog("ACTION", "No state provided, composing new state");
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

            debugLog("ACTION", "Starting onboarding process");
            const result = await performOnboardingWithPython(ethPrivateKey);

            if (result.success) {
                debugLog(
                    "ACTION",
                    "Processing successful onboarding results",
                    result
                );

                result.results.forEach((networkResult) => {
                    const network = networkResult.network as "testnet" | "prod";
                    onboardingState.networkResults![network] = {
                        success: networkResult.success,
                        account_address: networkResult.account_address,
                        ethereum_account: networkResult.ethereum_account,
                        error: networkResult.error,
                    };

                    debugLog(
                        "ACTION",
                        `Network ${network} result processed`,
                        networkResult
                    );
                });

                const successfulResult = result.results.find((r) => r.success);
                if (successfulResult) {
                    debugLog(
                        "ACTION",
                        "Updating state with successful result",
                        successfulResult
                    );
                    onboardingState.starknetAccount =
                        successfulResult.account_address;
                    onboardingState.ethereumAccount =
                        successfulResult.ethereum_account;
                }

                return true;
            } else {
                debugLog("ACTION", "Onboarding failed on all networks", result);
                return false;
            }
        } catch (error) {
            debugLog("ACTION", "Handler error", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
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
