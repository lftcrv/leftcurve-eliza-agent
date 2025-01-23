import { Plugin } from "@elizaos/core";
import { marketDataProvider } from "./providers/marketData";

export const paradexPlugin: Plugin = {
    name: "paradex",
    description: "Paradex Plugin for Eliza",
    providers: [marketDataProvider],
};

export default paradexPlugin;
