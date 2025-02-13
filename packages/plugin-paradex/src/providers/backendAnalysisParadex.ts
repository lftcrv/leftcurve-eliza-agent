import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    WalletAdapter,
} from "@elizaos/core";
import { ParadexState } from "../types";

interface TechnicalAnalysis {
    assetId: string;
    timestamp: number;
    technical: {
        lastPrice: number;
        changes: {
            "30min": string;
            "1h": string;
            "4h": string;
        };
        keySignals: {
            shortTerm: {
                timeframe: string;
                patterns: {
                    recent: Array<{
                        type: string;
                        strength: number;
                    }>;
                };
                momentum: {
                    rsi: {
                        value: number;
                        condition: string;
                    };
                    macd: {
                        signal: string;
                        strength: number;
                    };
                    stochastic: {
                        k: number;
                        d: number;
                        condition: string;
                    };
                };
            };
            mediumTerm: {
                timeframe: string;
                trend: {
                    primary: {
                        direction: string;
                        strength: number;
                    };
                };
                technicals: {
                    ichimoku: {
                        signal: string;
                        cloudState: string;
                    };
                    levels: {
                        pivots: {
                            pivot: number;
                            r1: number;
                            s1: number;
                        };
                    };
                };
            };
            longTerm: {
                timeframe: string;
                support: number;
                resistance: number;
            };
        };
        volatility: number;
    };
}

// const formatAnalysis = (analysis: TechnicalAnalysis): string => {
//     const tech = analysis.technical;
//     const signals = tech.keySignals;
    
//     return `${analysis.assetId} Analysis:
// Price: $${tech.lastPrice.toFixed(2)}
// Changes: ${tech.changes["30min"]} (30m) | ${tech.changes["1h"]} (1h) | ${tech.changes["4h"]} (4h)

// Short-term (${signals.shortTerm.timeframe}):
// - Patterns: ${signals.shortTerm.patterns.recent.map(p => `${p.type} (${(p.strength * 100).toFixed(1)}%)`).join(", ")}
// - RSI: ${signals.shortTerm.momentum.rsi.value.toFixed(2)} (${signals.shortTerm.momentum.rsi.condition})
// - MACD: ${signals.shortTerm.momentum.macd.signal} (${(signals.shortTerm.momentum.macd.strength * 100).toFixed(1)}% strength)

// Medium-term (${signals.mediumTerm.timeframe}):
// - Trend: ${signals.mediumTerm.trend.primary.direction} (${(signals.mediumTerm.trend.primary.strength * 100).toFixed(1)}% strength)
// - Ichimoku: ${signals.mediumTerm.technicals.ichimoku.signal} (${signals.mediumTerm.technicals.ichimoku.cloudState})
// - Pivot: ${signals.mediumTerm.technicals.levels.pivots.pivot.toFixed(2)}
//   R1: ${signals.mediumTerm.technicals.levels.pivots.r1.toFixed(2)}
//   S1: ${signals.mediumTerm.technicals.levels.pivots.s1.toFixed(2)}

// Long-term (${signals.longTerm.timeframe}):
// Support: ${signals.longTerm.support.toFixed(2)}
// Resistance: ${signals.longTerm.resistance.toFixed(2)}

// Volatility: ${(tech.volatility * 100).toFixed(1)}%`;
// };

export const analysisParadexProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State & ParadexState
    ) => {
        try {
            // Get watchlist to know which assets to analyze
            // const walletAdapter = new WalletAdapter(runtime.databaseAdapter.db);
            // const watchlist = await walletAdapter.getWatchlist(message.roomId);

            // if (watchlist.length === 0) {
            //     return "No assets in watchlist to analyze.";
            // }

            const backendPort = process.env.BACKEND_PORT || "3080";
            const apiKey = process.env.BACKEND_API_KEY;
            const isLocal = process.env.LOCAL_DEVELOPMENT === "TRUE";

            if (!apiKey) {
                elizaLogger.error("Backend API key not set");
                return "Unable to fetch analysis - missing API key.";
            }

            const host = isLocal ? "localhost" : "host.docker.internal";

            const assetsQuery = "BTC";

            try {
                const response = await fetch(
                    `http://${host}:${backendPort}/analysis/latest?assets=${assetsQuery}&platform=paradex`,
                    {
                        method: "GET",
                        headers: {
                            Accept: "application/json",
                            "x-api-key": apiKey,
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `Backend request failed: ${response.status} ${response.statusText}`
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
                return "Failed to fetch technical analysis data. Please try again later.";
            }
        } catch (error) {
            elizaLogger.error("Technical Analysis Provider error:", error);
            return "Unable to process technical analysis request.";
        }
    },
};