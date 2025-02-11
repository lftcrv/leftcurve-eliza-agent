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

interface FilteredMarketInfo {
    currentPrice: number;
    starknetVolume24h: number;
    priceChangePercentage: {
        "1h": number;
        "24h": number;
        "7d": number;
    };
}

export interface TokenDetailsEssentials {
    name: string;
    symbol: string;
    market: FilteredMarketInfo;
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


export interface TradeDecision {
    shouldTrade: "yes" | "no";
    swap: SwapContent;
    Explanation: string;
    Tweet: string;
}

export interface SwapContent {
    sellTokenName: string;
    buyTokenName: string;
    sellAmount: string;
}
