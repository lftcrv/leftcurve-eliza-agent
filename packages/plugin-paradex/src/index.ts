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

export const paradexPlugin: Plugin = {
    name: "paradex",
    description: "Paradex Plugin for Eliza",
    actions: [manageWatchlistAction, paradexFetchAccountInfoAction, paradexPlaceOrderAction],
    providers: [watchlistProvider, openOrdersProvider, openPositionsProvider],
};

export default paradexPlugin;
