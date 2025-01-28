import { Plugin } from "@elizaos/core";
import { marketDataProvider } from "./providers/marketData";
import { manageWatchlistAction } from "./actions/manageWatchlist";
import { getWatchlistAction } from "./actions/getWatchlist";

export const paradexPlugin: Plugin = {
    name: "paradex",
    description: "Paradex Plugin for Eliza",
    actions: [manageWatchlistAction, getWatchlistAction],
    providers: [marketDataProvider],
};

export default paradexPlugin;
