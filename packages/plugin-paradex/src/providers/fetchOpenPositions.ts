import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";
import { getJwtToken, ParadexAuthError } from "../utils/getJwtParadex";
import { ParadexState } from "../types";

interface Position {
    average_entry_price: string;
    average_entry_price_usd: string;
    average_exit_price: string;
    cached_funding_index: string;
    closed_at: number;
    cost: string;
    cost_usd: string;
    created_at: number;
    id: string;
    last_fill_id: string;
    last_updated_at: number;
    leverage: string;
    liquidation_price: string;
    market: string;
    realized_positional_funding_pnl: string;
    realized_positional_pnl: string;
    seq_no: number;
    side: string;
    size: string;
    status: string;
    unrealized_funding_pnl: string;
    unrealized_pnl: string;
}

interface PositionResponse {
    results: Position[];
}

function getParadexUrl(): string {
    const network = (process.env.PARADEX_NETWORK || "testnet").toLowerCase();
    if (network !== "testnet" && network !== "prod") {
        throw new Error("PARADEX_NETWORK must be either 'testnet' or 'prod'");
    }
    return `https://api.${network}.paradex.trade/v1`;
}

async function fetchPositions(jwt: string): Promise<PositionResponse> {
    const baseUrl = getParadexUrl();
    const url = `${baseUrl}/positions`;

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch positions: ${response.status} ${response.statusText}`
            );
        }

        const data = await response.json();
        return data;
    } catch (error) {
        elizaLogger.error("Error fetching positions:", error);
        throw error;
    }
}

function formatNumber(value: string, decimals: number = 2): string {
    const num = parseFloat(value);
    return isNaN(num) ? "N/A" : num.toFixed(decimals);
}

function calculateROE(unrealizedPnl: string, cost: string): string {
    const pnl = parseFloat(unrealizedPnl);
    const costValue = parseFloat(cost);

    if (isNaN(pnl) || isNaN(costValue) || costValue === 0) {
        return "N/A";
    }

    return ((pnl / Math.abs(costValue)) * 100).toFixed(2);
}

export const openPositionsProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State & ParadexState
    ) => {
        try {
            const ethPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;
            if (!ethPrivateKey) {
                throw new ParadexAuthError("ETHEREUM_PRIVATE_KEY not set");
            }

            // Get JWT token
            const authResult = await getJwtToken(ethPrivateKey);
            if (!authResult.jwt_token) {
                throw new ParadexAuthError("Failed to get JWT token");
            }

            if (state) {
                state.jwtToken = authResult.jwt_token;
                state.jwtExpiry = authResult.expiry;
                state.starknetAccount = authResult.account_address;
            }

            const positionsData = await fetchPositions(authResult.jwt_token);

            if (!positionsData.results || positionsData.results.length === 0) {
                return "No open positions found.";
            }

            const formattedPositions = positionsData.results
                .filter((position) => position.status === "OPEN")
                .map((position) => {
                    const size = formatNumber(position.size, 4);
                    const entryPrice = formatNumber(
                        position.average_entry_price
                    );
                    const markPrice = formatNumber(position.average_exit_price);
                    const unrealizedPnl = formatNumber(position.unrealized_pnl);
                    const fundingPnl = formatNumber(
                        position.unrealized_funding_pnl
                    );
                    const roe = calculateROE(
                        position.unrealized_pnl,
                        position.cost
                    );
                    const leverage = position.leverage || "1";
                    const liqPrice = formatNumber(position.liquidation_price);

                    const formatted = [
                        `ID: ${position.id}`,
                        `${position.market} | ${position.side} ${size}`,
                        `Entry: ${entryPrice} | Mark: ${markPrice}`,
                        `PnL: $${unrealizedPnl} (${roe}% ROE)`,
                        `Funding PnL: $${fundingPnl}`,
                        `Leverage: ${leverage}x | Liq. Price: ${liqPrice}`,
                    ].join(" | ");

                    return formatted;
                });

            if (state) {
                state.positions = positionsData.results;
            }

            const finalResponse = `Current Open Positions:\n${formattedPositions.join(
                "\n"
            )}`;
            return finalResponse;
        } catch (error) {
            elizaLogger.error("Positions Provider error:", error);
            if (error instanceof ParadexAuthError) {
                elizaLogger.error("Auth Details:", error.details);
            }
            return "Unable to fetch positions. Please try again later.";
        }
    },
};
