import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

const timestampProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        const timestamp = Date.now();
        return `Current timestamp:

${JSON.stringify({
    timestamp,
    humanReadable: new Date(timestamp).toISOString()
}, null, 2)}`;
    }
};

export { timestampProvider };