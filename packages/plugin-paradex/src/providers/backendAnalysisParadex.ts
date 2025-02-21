import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    WalletAdapter,
} from "@elizaos/core";
import { BaseParadexState } from "../types";

interface AnalysisState extends BaseParadexState {
    openOrders?: string;
    openPositions?: string;
    marketMetrics?: any;
    currentBalance?: any;
    technicalAnalysis?: any;
    orderRequestObj?: {
        action: string;
        market: string;
        size: number;
        price?: number;
    };
}
export const analysisParadexProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: AnalysisState,
    ) => {
        try {
            const apiKey = process.env.BACKEND_API_KEY;
            const backendPort = process.env.BACKEND_PORT || "8080";
            const isLocal = process.env.LOCAL_DEVELOPMENT === "TRUE";
            const host = isLocal ? process.env.HOST : "host.docker.internal";

            if (!apiKey) {
                elizaLogger.error("Backend API key not set");
                return "Unable to fetch analysis - missing API key.";
            }

            const assetsQuery = "BTC,ETH,STRK,AAVE,AI16Z";

            try {
                console.log(
                    "url",
                    `http://${host}:${backendPort}/analysis/latest?assets=${assetsQuery}&platform=paradex`,
                );
                const response = await fetch(
                    `http://${host}:${backendPort}/analysis/latest?assets=${assetsQuery}&platform=paradex`,
                    {
                        method: "GET",
                        headers: {
                            Accept: "application/json",
                            "x-api-key": apiKey,
                        },
                    },
                );

                if (!response.ok) {
                    throw new Error(
                        `Backend request failed: ${response.status} ${response.statusText}`,
                    );
                }

                const data = await response.json();

                if (!Array.isArray(data) || data.length === 0) {
                    return "No analysis data available for the requested assets.";
                }

                if (state) {
                    state.technicalAnalysis = data;
                    state.lastAnalysisTimestamp = Date.now();
                }

                return JSON.stringify(data, null, 2);
            } catch (error) {
                elizaLogger.error("Error fetching technical analysis:", error);
                console.log("Error fetching technical analysis:", error);
                return "Failed to fetch technical analysis data. Please try again later.";
            }
        } catch (error) {
            elizaLogger.error("Technical Analysis Provider error:", error);
            console.log("Technical Analysis Provider error:", error);
            return "Unable to process technical analysis request.";
        }
    },
};
