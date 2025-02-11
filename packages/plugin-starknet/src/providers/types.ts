export interface Analysis {
    lastPrice: number;
    changes: Record<string, string>;
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
                    momentum: {
                        value: number;
                        period: number;
                        sustainedPeriods: number;
                    };
                };
                price: {
                    action: {
                        direction: string;
                        strength: number;
                        testedLevels: {
                            recent: number;
                            count: number;
                        };
                    };
                    volatility: {
                        bbWidth: number;
                        state: string;
                    };
                };
            };
            technicals: {
                momentum: {
                    roc: {
                        value: number;
                        state: string;
                        period: number;
                    };
                    adx: {
                        value: number;
                        trending: boolean;
                        sustainedPeriods: number;
                    };
                };
                ichimoku: {
                    signal: string;
                    cloudState: string;
                    lines: {
                        conversion: number;
                        base: number;
                        priceDistance: number;
                    };
                };
                levels: {
                    pivots: {
                        pivot: number;
                        r1: number;
                        s1: number;
                        breakout: string;
                        r1Distance: number;
                    };
                };
                volume: {
                    trend: string;
                    significance: number;
                    profile: {
                        distribution: string;
                        activity: number;
                        sustainedPeriods: number;
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
}

export interface TechnicalAnalysis {
    status: string;
    data: {
        timestamp: number;
        analyses: Record<string, Analysis>;
    };
}