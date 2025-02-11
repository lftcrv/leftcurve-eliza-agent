import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const getScriptPaths = () => {
    const pluginRoot = path.resolve(__dirname, '..');
    const pythonDir = path.join(pluginRoot, 'src', 'python');
    
    const venvPath = process.platform === "win32"
        ? path.join(pythonDir, '.venv', 'Scripts', 'python.exe')
        : path.join(pythonDir, '.venv', 'bin', 'python3');
        
    const scriptPath = path.join(pythonDir, 'fetch_jwt.py');
    
    console.log("Paths:", {
        pluginRoot,
        pythonDir,
        venvPath,
        scriptPath,
        venvExists: fs.existsSync(venvPath),
        scriptExists: fs.existsSync(scriptPath)
    });
    
    return { venvPath, scriptPath, pythonDir };
};

const getJwtToken = (ethPrivateKey: string): Promise<AuthResponse> => {
    return new Promise((resolve, reject) => {
        const { venvPath, scriptPath, pythonDir } = getScriptPaths();

        if (!fs.existsSync(venvPath)) {
            console.error("Python virtual environment not found at:", venvPath);
            reject(new ParadexAuthError("Python virtual environment not found"));
            return;
        }

        if (!fs.existsSync(scriptPath)) {
            console.error("Python script not found at:", scriptPath);
            reject(new ParadexAuthError("Python script not found"));
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
            },
        });

        pythonProcess.stdout.on("data", (data) => {
            const chunk = data.toString();
            stdout += chunk;
            console.log("Python stdout:", chunk);
        });

        pythonProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderr += chunk;
            console.log("Python stderr:", chunk);
        });

        pythonProcess.on("close", (code) => {

            if (code === 0 && stdout) {
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    console.error("Failed to parse Python output:", e);
                    console.log("Raw stdout:", stdout);
                    reject(
                        new ParadexAuthError(
                            "Failed to parse Python script output",
                            { stdout, stderr, parseError: e }
                        )
                    );
                }
            } else {
                console.error("Python script failed");
                console.log("Exit code:", code);
                console.log("stdout:", stdout);
                console.log("stderr:", stderr);
                reject(
                    new ParadexAuthError(
                        "Script failed with error",
                        { stdout, stderr, code }
                    )
                );
            }
        });

        pythonProcess.on("error", (error) => {
            console.error("Failed to start Python process:", error);
            reject(
                new ParadexAuthError(
                    `Failed to execute Python script: ${error.message}`,
                    { error, pythonPath: venvPath, scriptPath }
                )
            );
        });

        const timeout = setTimeout(() => {
            console.log("Python process timed out - killing process");
            pythonProcess.kill();
            reject(new ParadexAuthError("Authentication timed out"));
        }, 30000);

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

            const result = await getJwtToken(ethPrivateKey);

            if (result.jwt_token) {
                state.jwtToken = result.jwt_token;
                state.jwtExpiry = result.expiry;
                state.starknetAccount = result.account_address;
                console.log("Successfully obtained JWT token and updated state", result.jwt_token)
                return true;
            } else {
                console.error("No JWT token in result:", result);
                throw new ParadexAuthError(
                    "Failed to get JWT token from Python script"
                );
            }
        } catch (error) {
            console.error("Authentication error:", error);
            if (error instanceof ParadexAuthError) {
                console.error("Details:", error.details);
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