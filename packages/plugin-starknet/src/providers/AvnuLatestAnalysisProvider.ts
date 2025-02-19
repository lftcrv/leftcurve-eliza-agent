import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { AssetAnalysis } from "./types";

const apiKey = process.env.BACKEND_API_KEY;

const AVNU_ASSETS = [
    'BROTHER', 'STRK'
    , 'LORDS', 'USDC', 'ETH', 'UNI'
    //'WBTC', 'UNI', 'RETH', 'XSTRK', 'NSTR',
    //'ZEND', 'SWAY', 'SSTR'
];

const fetchAvnuLatestAnalysis = async (assets: string[] = AVNU_ASSETS): Promise<AssetAnalysis[]> => {
    const assetsParam = assets.join(',');
    const response = await fetch(
        `http://127.0.0.1:8080/analysis/latest?assets=${assetsParam}&platform=avnu`,
        {
            headers: {
                'accept': '*/*',
                'x-api-key': apiKey,
            }
        }
    );
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return response.json();
};


const AvnuLatestAnalysisProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        try {
            const analysis = await fetchAvnuLatestAnalysis();
            return `timeframes: shortTerm=5m mediumTerm=1h longTerm=4h
momentum: rsi(0-100,>70overbought,<30oversold) macd(momentum,-1to1) stochastic(0-100,>80overbought,<20oversold)
ichimoku: cloudState(above/below/inside) trend indicator, priceDistance(-/+)=price vs cloud distance%
trend: primary.strength(0-1)=trend reliability, action.strength(0-1)=price movement significance
volatility: bbWidth=bollinger width, higher=more volatile
patterns: strength(0-1)=pattern reliability

${JSON.stringify(analysis, null, 2)}`;
        } catch (error) {
            console.error('Error in AvnuLatestAnalysisProvider:', error);
            throw error;
        }
    }
};

export { AvnuLatestAnalysisProvider };