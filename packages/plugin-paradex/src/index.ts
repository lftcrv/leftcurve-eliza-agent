import { Plugin } from "@elizaos/core";
import { marketDataProvider } from "./providers/marketData";
import { manageWatchlistAction } from "./actions/manageWatchlist";
import { getWatchlistAction } from "./actions/getWatchlist";
import { bboProvider } from "./providers/bbo";
import { watchlistProvider } from "./providers/watchlist";

export const paradexPlugin: Plugin = {
    name: "paradex",
    description: "Paradex Plugin for Eliza",
    actions: [manageWatchlistAction, getWatchlistAction],
    providers: [marketDataProvider, bboProvider, watchlistProvider],
};

export default paradexPlugin;
