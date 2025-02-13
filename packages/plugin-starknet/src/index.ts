import type { Plugin } from "@elizaos/core";
import { tokenProvider } from "./providers/token";
import { tradeAction } from "./actions/trade";
import { marketInfosProvider } from "./providers/marketInfosProvider";
import { walletBalancesProvider } from "./providers/walletProvider";
import { tradeSimulationAction } from "./actions/tradeSimulation";
import { ParedexLatestAnalysisProvider } from "./providers/ParedexLatestAnalysisProvider";
import { AvnuLatestAnalysisProvider } from "./providers/AvnuLatestAnalysisProvider";


export const starknetPlugin: Plugin = {
    name: "starknet",
    description: "Starknet Plugin for Eliza",
    actions: [],
    evaluators: [],
    providers: [ParedexLatestAnalysisProvider, AvnuLatestAnalysisProvider],
};

export default starknetPlugin;
