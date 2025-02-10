export interface ParadexState {
    marketsInfo?: string;
    watchlist?: string[];
    marketMetrics?: {
        [market: string]: {
            spread: number;
            spreadPercentage: number;
            lastBid: number;
            lastAsk: number;
            timestamp: number;
        };
    };
    jwt?: string;
    jwtExpiration?: number;
    isOnboarded?: boolean;
}
