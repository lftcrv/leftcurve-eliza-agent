import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

async function fetchTokenPrices(tokens: string[]): Promise<any> {
    if (tokens.length === 0) {
        throw new Error("Le tableau des tokens ne peut pas être vide.");
    }

    const queryString = tokens.map(token => `token=${encodeURIComponent(token)}`).join('&');
    const url = `https://starknet.impulse.avnu.fi/v1/tokens/prices?${queryString}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

const tokenNames = {
    "0x3b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee": "BROTHER",
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH",
    "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49": "STRK",
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC",
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac": "WBTC",
};


const tokenPricesProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        const tokenAddresses = Object.keys(tokenNames);

        try {
            const data = await fetchTokenPrices(tokenAddresses);

            // Formatage des données
            const formattedData = data.map(item => {
                const tokenName = tokenNames[item.address] || "Unknown Token";
                return `Token: ${tokenName}, Price in USD: ${item.priceInUSD ?? "undefined"}, Price in ETH: ${item.priceInETH ?? "undefined"}`;
            }).join('\n');

            console.log(formattedData);
            return formattedData;
        } catch (error) {
            console.error('Erreur:', error);
            throw error;
        }
    },
};

export { tokenPricesProvider };
