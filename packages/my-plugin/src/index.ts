import { Plugin } from "@ai16z/eliza";
import { helloWorldAction } from "./actions/helloworld.ts";
import { factEvaluator } from "./evaluators/fact.ts";
import { currentNewsAction } from "./actions/currentnews.ts";
import { randomEmotionProvider } from "./providers/getEmotion.ts";
import { tokenPricesProvider } from "./providers/tokenPricesProvider.ts";
import { marketInfosProvider } from "./providers/marketInfosProvider.ts";
import { scheduleTaskAction } from "./actions/scheduleTask.ts";

export * as actions from "./actions/index.ts";
export * as evaluators from "./evaluators/index.ts";
export * as providers from "./providers/index.ts";

export const myPlugin: Plugin = {
    name: "devSchool",
    description: "Dev School example plugin",
    actions: [helloWorldAction, currentNewsAction, scheduleTaskAction],
    providers: []
};
