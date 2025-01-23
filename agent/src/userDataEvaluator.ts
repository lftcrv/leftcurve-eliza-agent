import { Evaluator, IAgentRuntime, Memory } from "@ai16z/eliza";

export const userDataEvaluator: Evaluator = {
    name: "GET_USER_DATA",
    similes: ["GET_INFORMATION", "EXTRACT_INFORMATION"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("**** EVALUATING STUFF !!!!");
        console.log(message);
        return true;
    },
    description: "Get user data from the database",
    examples: [],
};