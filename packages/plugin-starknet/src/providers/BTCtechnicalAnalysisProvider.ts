import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import{ TechnicalAnalysis } from "./types.ts";
import { fetchTechnicalAnalysis } from "../utils/index.ts";


const technicalAnalysisProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        try {
            const analysis = await fetchTechnicalAnalysis();
            return `Technical indicators guide:
timeframes: shortTerm=5m mediumTerm=1h longTerm=4h
momentum: rsi(0-100,>70overbought,<30oversold) macd(momentum,crossovers) stochastic(0-100,>80overbought,<20oversold)
ichimoku: cloudState(above/below/inside) measures trend strength
volume.significance(0-1) volume.profile.activity(0-1) indicate trading intensity
strength values(0-1): higher=stronger signal
volatility: bbWidth=bollinger bands width

${JSON.stringify(analysis.data.analyses.BTC)}`;
        } catch (error) {
            console.error('Error in technicalAnalysisProvider:', error);
            throw error;
        }
    }
};

export { technicalAnalysisProvider };