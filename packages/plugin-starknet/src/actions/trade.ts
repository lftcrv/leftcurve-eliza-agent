import {
    Action,
    ActionExample,
    booleanFooter,
    composeContext,
    Content,
    elizaLogger,
    generateMessageResponse,
    generateObjectDeprecated,
    generateTrueOrFalse,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    messageCompletionFooter,
    ModelClass,
    State,
} from "@ai16z/eliza";
import {
    executeSwap as executeAvnuSwap,
    fetchQuotes,
    QuoteRequest,
} from "@avnu/avnu-sdk";

import { getStarknetAccount } from "../utils/index.ts";
import { validateStarknetConfig } from "../environment.ts";

interface SwapContent {
    sellTokenAddress: string;
    buyTokenAddress: string;
    sellAmount: string;
}

export function isSwapContent(content: SwapContent): content is SwapContent {
    // Validate types
    const validTypes =
        typeof content.sellTokenAddress === "string" &&
        typeof content.buyTokenAddress === "string" &&
        typeof content.sellAmount === "string";
    if (!validTypes) {
        return false;
    }
    // Validate addresses (must be 32-bytes long with 0x prefix)
    const validAddresses =
        content.sellTokenAddress.startsWith("0x") &&
        content.sellTokenAddress.length <= 66 &&
        content.sellTokenAddress.length >= 64 &&
        content.buyTokenAddress.startsWith("0x") &&
        content.buyTokenAddress.length <= 66 &&
        content.buyTokenAddress.length >= 64;

    return validAddresses;
}


export const shouldTradeTemplate =
    `# Task: Decide whether {{agentName}} should make any swap or stay idle.

Based on the market data and the wallet informations, is it interesting to make any swap? YES or NO

{{providers}}

Is it interesting for {{agentName}} to make any swap? ` + booleanFooter;

const swapTemplate = `
{{knowledge}}

{{providers}}

Based on the market data you have, as well as your wallet informations (and any other relevant data), choose which swap is the most profitable to make and present it in the form of a response.
To avoid issues related to fees, the ETH balance must never drop below 0.002 ETH.
If you feel that you're getting close to this limit, don't hesitate to buy more ETH.

Respond with a JSON markdown block.

Example response format (strictly follow this format):
\`\`\`json
{
    "sellTokenAddress": "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "buyTokenAddress": "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
    "sellAmount": "1000000000000000000"
}
\`\`\`

Here are the token addresses available for you to use in your response :

- BROTHER/brother/$brother: 0x03b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee
- BTC/btc: 0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac
- ETH/eth: 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
- STRK/strk: 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
- LORDS/lords: 0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49
- USDT/usdt: 0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8
- USDC/usdc: 0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8
- wstETH: 0x42b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2
- WBTC/wbtc: 0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac
- UNI/uni: 0x49210ffc442172463f3177147c1aeaa36c51d152c1b0630f2364c300d4f48ee
- DAI/dai: 0x5574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad
- rETH: 0x319111a5037cbec2b3e638cc34a3474e2d2608299f3e62866e9cc683208c610
- LUSD/lusd: 0x70a76fd48ca0ef910631754d77dd822147fe98a569b826ec85e3c33fde586ac
- xSTRK: 0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a
- NSTR/nstr: 0xc530f2c0aa4c16a0806365b0898499fba372e5df7a7172dc6fe9ba777e8007
- ZEND/zend: 0x585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34
- SWAY/sway: 0x4878d1148318a31829523ee9c6a5ee563af6cd87f90a30809e5b0d27db8a9b
- SSTR/sstr: 0x102d5e124c51b936ee87302e0f938165aec96fb6c2027ae7f3a5ed46c77573b



To summarize, your response must include:
- Sell token address
- Buy token address
- Amount to sell (in wei)
`;

export const tradeAction: Action = {
    name: "EXECUTE_STARKNET_TRADE",
    similes: [
        "TRADE",
        "STARKNET_TOKEN_TRADE",
        "STARKNET_TRADE_TOKENS",
        "STARKNET_EXCHANGE_TOKENS",
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        await validateStarknetConfig(runtime);
        return true;
    },
    description:
        "Perform a token swap on starknet. Use this action when a user asks you to trade.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting EXECUTE_STARKNET_TRADE handler...");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        async function _shouldTrade(state: State): Promise<boolean> {
            // If none of the above conditions are met, use the generateText to decide
            const shouldTradeContext = composeContext({
                state,
                template: shouldTradeTemplate,
            });

            const response = await generateTrueOrFalse({
                context: shouldTradeContext,
                modelClass: ModelClass.SMALL,
                runtime,
            });

            return response;
        }

        const shouldTrade = await _shouldTrade(state);

        if (shouldTrade){
            const swapContext = composeContext({
                state,
                template: swapTemplate,
            });

            const response = await generateObjectDeprecated({
                runtime,
                context: swapContext,
                modelClass: ModelClass.MEDIUM,
            });

            console.log("Response:", response);
            elizaLogger.debug("Response:", response);

            if (!isSwapContent(response)) {
                callback?.({ text: "Invalid swap content, please try again." });
                return false;
            }
            elizaLogger.log("ooookkkkk 999999");
            try {
                elizaLogger.log("ooookkkkk 00000");
                callback?.({ text: "OOOOOOOOOOOOKKKK 00000." });
                elizaLogger.log("buyTokenaddress : " + response.buyTokenAddress);
                elizaLogger.log("sellAmount : " + response.sellAmount);
                elizaLogger.log("sellTokenAddress : " + response.sellTokenAddress);
                // Get quote
                const quoteParams: QuoteRequest = {
                    sellTokenAddress: response.sellTokenAddress,
                    buyTokenAddress: response.buyTokenAddress,
                    sellAmount: BigInt(response.sellAmount),
                };

                const quote = await fetchQuotes(quoteParams);
                callback?.({ text: "OOOOOOOOOOOOKKKK 1111." });
                elizaLogger.log("ooookkkkk 11111111111");
                //getStarknetAccount(runtime);
                elizaLogger.log("get starknet account OKKKK");
                // Execute swap
                const swapResult = await executeAvnuSwap(
                    getStarknetAccount(runtime),
                    quote[0],
                    {
                        slippage: 0.05, // 5% slippage
                        executeApprove: true,
                    }
                );

                elizaLogger.log(
                    "Swap completed successfully! tx: " + swapResult.transactionHash
                );
                callback?.({
                    text:
                        "Swap completed successfully! tx: " +
                        swapResult.transactionHash,
                });

                return true;
            } catch (error) {
                console.log("Error during token swap:", error);
                callback?.({ text: `Error during swap:` });
                return false;
            }
        }else{
            console.log("It is not relevant to trade at the moment.");
            callback?.({ text: "It is not relevant to trade at the moment." });
        }
    },
    examples: [] as ActionExample[][],
} as Action;
