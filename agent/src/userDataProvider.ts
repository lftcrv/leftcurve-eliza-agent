import { IAgentRuntime, Memory, Provider } from "@ai16z/eliza";

const userDataProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory) => {
        return "SOME USER DATA !!!!!";
    },
};

export {userDataProvider};