import { Plugin } from "@elizaos/core";
import { getMarketsAction } from "./actions/markets";
import { marketDataProvider } from "./providers/marketData";

export const paradexPlugin: Plugin = {
    name: "paradex",
    description: "Paradex Plugin for Eliza",
    actions: [getMarketsAction],
    providers: [marketDataProvider],
};

export default paradexPlugin;
