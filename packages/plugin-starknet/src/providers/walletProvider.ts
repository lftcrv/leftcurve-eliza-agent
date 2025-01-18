import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";
import { RpcProvider, Contract } from "starknet";
import * as dotenv from "dotenv";
dotenv.config();

// 1️⃣ Connexion au réseau **Mainnet**
const provider = new RpcProvider({
    nodeUrl: "https://free-rpc.nethermind.io/mainnet-juno/v0_7",
});

// 2️⃣ Adresse des contrats
const TOKENS = {
    BROTHER:
        "0x03b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee",
    BTC: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    ETH: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    STRK: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    LORDS: "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
    USDT: "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    USDC: "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    wstETH: "0x42b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2",
    WBTC: "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    UNI: "0x49210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee",
    DAI: "0x5574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
    rETH: "0x319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610",
    LUSD: "0x70a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac",
    xSTRK: "0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
    NSTR: "0xc530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007",
    ZEND: "0x585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34",
    SWAY: "0x4878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b",
    SST: "0x102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b",
};

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
        const balanceInToken = Number(balanceInWei) / 1e18;

        return `${tokenName}: ${balanceInToken} ${tokenName}`;
    } catch (error) {
        return `Error for ${tokenName}`;
    }
}

async function getAllBalances() {
    const balances = await Promise.all(
        Object.entries(TOKENS).map(([tokenName, tokenAddress]) =>
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
