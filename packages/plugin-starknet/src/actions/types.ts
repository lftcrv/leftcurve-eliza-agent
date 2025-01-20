export interface MarketData {
    currentPrice: number;
    marketCap: number;
    fullyDilutedValuation?: number | null;
    starknetTvl: number;
    priceChange1h: number;
    priceChangePercentage1h: number;
    priceChange24h: number;
    priceChangePercentage24h: number;
    priceChange7d: number;
    priceChangePercentage7d: number;
    marketCapChange24h?: number | null;
    marketCapChangePercentage24h?: number | null;
    starknetVolume24h: number;
    starknetTradingVolume24h: number;
}

export interface TokenDetails {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    coingeckoid?: string;
    verified: boolean;
    market: MarketData;
    tags: string[];
}

export interface SwapContent {
    sellTokenAddress: string;
    buyTokenAddress: string;
    sellAmount: string;
}

export interface LinePriceFeedItem {
    date: string;
    value: number;
}

export interface TokenPriceFeed {
    tokenAddress: string;
    tokenName: string;
    priceFeed: LinePriceFeedItem[];
}

export interface Swap {
    sellTokenAddress: string;
    buyTokenAddress: string;
    sellAmount: string;
}

export interface TradeDecision {
    shouldTrade: "yes" | "no";
    swap: Swap;
    Explanation: string;
    Tweet: string;
}
