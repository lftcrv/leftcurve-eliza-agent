import { Plugin } from "@elizaos/core";
import { marketDataProvider } from "./providers/marketData";
import { manageWatchlistAction } from "./actions/manageWatchlist";
import { getWatchlistAction } from "./actions/getWatchlist";
import { bboProvider } from "./providers/bbo";
import { watchlistProvider } from "./providers/watchlist";
import { paradexFetchAccountInfoAction } from "./actions/fetchAccountInfo";
import { paradexPlaceOrderAction } from "./actions/placeOrder";
import { openOrdersProvider } from "./providers/fetchOpenOrders";
import { openPositionsProvider } from "./providers/fetchOpenPositions";
import { paradexCancelOrderAction } from "./actions/cancelOrder";
import { paradexOnboardingAction } from "./actions/onboarding";
import { analysisParadexProvider } from "./providers/backendAnalysisParadex";

export const paradexPlugin: Plugin = {
    name: "paradex",
    description: "Paradex Plugin for Eliza",
    actions: [paradexFetchAccountInfoAction, paradexPlaceOrderAction, paradexCancelOrderAction, paradexOnboardingAction],
    providers: [openOrdersProvider, openPositionsProvider, analysisParadexProvider],
};

export default paradexPlugin;
