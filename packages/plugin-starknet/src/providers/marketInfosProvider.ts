import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { TokenDetailsEssentials } from "../actions/types";

interface LinePriceFeedItem {
    date: string;
    value: number;
}

interface TokenPriceFeed {
    tokenAddress: string;
    tokenName: string;
    priceFeed: LinePriceFeedItem[];
}

const fetchTokenPriceFeed = async (
    tokenAddress: string,
    tokenName: string
): Promise<TokenPriceFeed> => {
    const url = `https://starknet.impulse.avnu.fi/v1/tokens/${tokenAddress}/prices/line?resolution=1D`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `HTTP Error: ${response.status} - ${response.statusText}`
            );
        }

        const data: LinePriceFeedItem[] = await response.json();
        return {
            tokenAddress,
            tokenName,
            priceFeed: data,
        };
    } catch (error) {
        console.error(
            `Error fetching price feed for token ${tokenName}:`,
            error
        );
        throw error;
    }
};

export const fetchMultipleTokenPriceFeeds = async (
    tokens: { address: string; name: string }[]
): Promise<TokenPriceFeed[]> => {
    const promises = tokens.map((token) =>
        fetchTokenPriceFeed(token.address, token.name)
    );
    return Promise.all(promises);
};

const fetchTokenDetailsEssentials = async (
    tokenAddress: string
): Promise<TokenDetailsEssentials> => {
    const url = `https://starknet.impulse.avnu.fi/v1/tokens/${tokenAddress}`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `HTTP Error: ${response.status} - ${response.statusText}`
            );
        }

        const data = await response.json();
        // Filter and restructure the data
        const filteredData: TokenDetailsEssentials = {
            name: data.name,
            symbol: data.symbol,
            market: {
                currentPrice: data.market.currentPrice,
                starknetVolume24h: data.market.starknetVolume24h,
                priceChangePercentage: {
                    "1h": data.market.priceChangePercentage1h,
                    "24h": data.market.priceChangePercentage24h,
                    "7d": data.market.priceChangePercentage7d,
                },
            },
        };

        return filteredData as TokenDetailsEssentials;
    } catch (error) {
        console.error(
            `Error fetching details for token ${tokenAddress}:`,
            error
        );
        throw error;
    }
};

export const fetchMultipleTokenDetails = async (
    tokens: { address: string; name: string }[]
): Promise<TokenDetailsEssentials[]> => {
    const promises = tokens.map((token) =>
        fetchTokenDetailsEssentials(token.address)
    );
    return Promise.all(promises);
};

const tokens = [
    {
        address:
            "0x03b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee",
        name: "BROTHER",
    },
    {
        address:
            "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
        name: "BTC",
    },
    {
        address:
            "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        name: "ETH",
    },
    {
        address:
            "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
        name: "STRK",
    },
    {
        address:
            "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
        name: "LORDS",
    },
    {
        address:
            "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
        name: "USDT",
    },
    {
        address:
            "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
        name: "USDC",
    },
    {
        address:
            "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2",
        name: "wstETH",
    },
    {
        address:
            "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
        name: "WBTC",
    },
    {
        address:
            "0x049210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee",
        name: "UNI",
    },
    {
        address:
            "0x05574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
        name: "DAI",
    },
    {
        address:
            "0x0319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610",
        name: "rETH",
    },
    {
        address:
            "0x070a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac",
        name: "LUSD",
    },
    {
        address:
            "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
        name: "xSTRK",
    },
    {
        address:
            "0x0c530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007",
        name: "NSTR",
    },
    {
        address:
            "0x0585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34",
        name: "ZEND",
    },
    {
        address:
            "0x04878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b",
        name: "SWAY",
    },
    {
        address:
            "0x0102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b",
        name: "SSTR",
    },
];

const marketInfosProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        try {
            const priceFeeds = await fetchMultipleTokenPriceFeeds(tokens);
            return JSON.stringify(priceFeeds, null, 2);
        } catch (error) {
            console.error("Error fetching token price feeds:", error);
        }
    },
};

export { marketInfosProvider };
