import { Content } from "@elizaos/core";

export interface ParadexConfig {
    baseUrl?: string;
}

export interface Market {
    symbol: string;
    base_currency: string;
    quote_currency: string;
    settlement_currency: string;
    order_size_increment: string;
    price_tick_size: string;
    open_at: number;
    expiry_at: number;
    asset_kind: string;
}

export interface MarketsResponse {
    results: Market[];
}

export interface GetMarketsActionContent extends Content {
    text: string;
}

export interface ParadexProviderResponse {
    success: boolean;
    data?: MarketsResponse;
    error?: string;
}
