import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuthResponse {
    jwt_token: string;
    expiry: number;
    account_address: string;
    error?: string;
}

export class ParadexAuthError extends Error {
    constructor(message: string, public details?: any) {
        super(message);
        this.name = "ParadexAuthError";
    }
}

const getScriptPaths = () => {
    const pluginRoot = path.resolve(__dirname, "..");
    const pythonDir = path.join(pluginRoot, "src", "python");

    const venvPath =
        process.platform === "win32"
            ? path.join(pythonDir, ".venv", "Scripts", "python.exe")
            : path.join(pythonDir, ".venv", "bin", "python3");

    const scriptPath = path.join(pythonDir, "fetch_jwt.py");

    return { venvPath, scriptPath, pythonDir };
};

export const getJwtToken = (ethPrivateKey: string): Promise<AuthResponse> => {
    return new Promise((resolve, reject) => {
        const { venvPath, scriptPath, pythonDir } = getScriptPaths();

        if (!fs.existsSync(venvPath)) {
            console.error("Python virtual environment not found at:", venvPath);
            reject(
                new ParadexAuthError("Python virtual environment not found")
            );
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
            // console.log("Python stdout:", chunk);
        });

        pythonProcess.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderr += chunk;
            // console.log("Python stderr:", chunk);
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
                    new ParadexAuthError("Script failed with error", {
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
