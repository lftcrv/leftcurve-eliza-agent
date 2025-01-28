import { bboProvider } from "./providers/bbo";

async function main() {
    const mockState = {
        watchlist: ["BTC-USD-PERP", "ETH-USD-PERP"],
        marketMetrics: {},
    };

    const result = await bboProvider.get(
        {} as any,
        {} as any,
        mockState as any
    );

    console.log("BBO Results:");
    console.log(result);
    console.log("\nMarket Metrics:", mockState.marketMetrics);
}

main().catch(console.error);
