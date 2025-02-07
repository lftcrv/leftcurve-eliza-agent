import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { RpcProvider, Contract } from "starknet";
import * as dotenv from "dotenv";
import { STARKNET_TOKENS } from "../utils/constants";
dotenv.config();

// 1️⃣ Connexion au réseau **Mainnet**
const provider = new RpcProvider({
    nodeUrl: "https://free-rpc.nethermind.io/mainnet-juno/v0_7",
});

const ERC20_ABI = [
    {
        inputs: [{ name: "account", type: "felt" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "felt" }],
        stateMutability: "view",
        type: "function",
    },
];

async function getTokenBalance(tokenName, tokenAddress) {
    try {
        const WALLET_ADDRESS = process.env.STARKNET_ADDRESS;
        const contract = new Contract(ERC20_ABI, tokenAddress, provider);
        const balanceCall = await contract.call("balanceOf", [WALLET_ADDRESS]);
        const balanceInWei = BigInt(
            (balanceCall as { balance: string }).balance
        );
        const balanceInToken = Number(balanceInWei) / 1e18; // todo fix: review, surely not working atm

        return `${tokenName}: ${balanceInToken} ${tokenName}`;
    } catch (error) {
        return `Error for ${tokenName}`;
    }
}

async function getAllBalances() {
    const balances = await Promise.all(
        Object.entries(STARKNET_TOKENS).map(([tokenName, tokenAddress]) =>
            getTokenBalance(tokenName, tokenAddress)
        )
    );
    const resultString = balances.join("\n");
    return resultString;
}

const walletBalancesProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        try {
            const balances = await getAllBalances();
            return "Here are the balances of your wallet.\n" + balances;
        } catch (error) {
            console.error("Erreur:", error);
            throw error;
        }
    },
};

export { walletBalancesProvider };
