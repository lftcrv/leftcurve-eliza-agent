import { IAgentRuntime } from "@elizaos/core";
import { Account, Contract, RpcProvider } from "starknet";


export const getStarknetProvider = (runtime: IAgentRuntime) => {
    return new RpcProvider({
        nodeUrl: runtime.getSetting("STARKNET_RPC_URL"),
    });
};

export const getStarknetAccount = (runtime: IAgentRuntime) => {
    return new Account(
        getStarknetProvider(runtime),
        runtime.getSetting("STARKNET_ADDRESS"),
        runtime.getSetting("STARKNET_PRIVATE_KEY")
    );
};
