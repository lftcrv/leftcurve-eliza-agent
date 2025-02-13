import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { fetchParadexLatestAnalysis } from "./utils";

const ParedexLatestAnalysisProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        try {
            const analysis = await fetchParadexLatestAnalysis();
            return `timeframes: shortTerm=5m mediumTerm=1h longTerm=4h
momentum: rsi(0-100,>70overbought,<30oversold) macd(momentum,crossovers) stochastic(0-100,>80overbought,<20oversold)
ichimoku: cloudState(above/below/inside) trend indicator, priceDistance(-/+)=price vs cloud
volatility: bbWidth=bollinger bandwidth, higher=more volatile
patterns: strength(0-1)=pattern reliability

${JSON.stringify(analysis, null, 2)}`;
        } catch (error) {
            console.error('Error in latestAnalysisProvider:', error);
            throw error;
        }
    }
};

export {ParedexLatestAnalysisProvider};