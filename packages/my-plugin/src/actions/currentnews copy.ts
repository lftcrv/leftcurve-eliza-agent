//import {
//    ActionExample,
//    composeContext,
//    Content,
//    generateText,
//    HandlerCallback,
//    IAgentRuntime,
//    Memory,
//    ModelClass,
//    State,
//    type Action,
//} from "@elizaos/core";
//
//async function getCurrentNews(searchTerm : string){
//    const apiKey = "1809642513d84b009fe12de73a3af77f";
//    const response = await fetch(`https://newsapi.org/v2/everything?q=${searchTerm}&apiKey=${apiKey}`);
//    const data = await response.json();
//    return data.articles.slice(0, 5).map(article => `${article.title}\n${article.description}\n${article.url}\n${article.content.slice(0,1000)}`).join("\n\n");
//    //return data;
//}
//
//export const currentNewsAction: Action = {
//    name: "CURRENT_NEWS",
//    similes: ["NEWS", "GET_NEWS", "GET_CURRENT_NEWS"],
//    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
//        return true;
//    },
//    description:
//        "Get the current news for a search term if asked by the user.",
//    handler: async (
//        _runtime: IAgentRuntime,
//        _message: Memory,
//        _state: State,
//        _options: { [key: string]: unknown },
//        _callback: HandlerCallback,
//    ): Promise<boolean> => {
//
//        const context = `Extract the search term from the user's message. The message is:
//        ${_message.content.text}
//
//        Only respond with the search term, do not include any other text.`;
//
//        const searchTerm = await generateText({
//            runtime: _runtime,
//            context,
//            modelClass: ModelClass.SMALL,
//            stop: ["\n"],
//
//        })
//
//        const CurrentNews = await getCurrentNews(searchTerm);
//
//
//        const currentNewsContext = `Respond by providing a summary of the following current news. This summary will be included in an LLM prompt.
//        The current News :
//        ${CurrentNews}
//`;
//
//        const response = await generateText({
//            runtime: _runtime,
//            context : currentNewsContext,
//            modelClass: ModelClass.SMALL,
//            stop: ["\n"],
//
//        })
//
//
//        const responseText =
//            "The current news for the search term " +
//            searchTerm +
//            " is " +
//            response;
//
//        const newMemory: Memory = {
//            userId: _message.agentId,
//            agentId:  _message.agentId,
//            roomId: _message.roomId,
//            content: {
//                text : responseText,
//                action: "CURRENT_NEWS_REPONSE",
//                source: _message.content?.source,
//            } as Content,
//        };
//
//        await _runtime.messageManager.createMemory(newMemory);
//
//        _callback(newMemory.content);
//        return true;
//    },
//    examples: [
//        [
//            {
//                user: "{{user1}}",
//                content: { text: "what's the latest news about ai ?" },
//            },
//            {
//                user: "{{user2}}",
//                content: { text: "", action: "CURRENT_NEWS" },
//            },
//        ],
//        [
//            {
//                user: "{{user1}}",
//                content: { text: "Can you show me current news about ai ?" },
//            },
//            {
//                user: "{{user2}}",
//                content: { text: "", action: "CURRENT_NEWS" },
//            },
//        ],
//        [
//            {
//                user: "{{user1}}",
//                content: { text: "Get me the latest news about ai ?" },
//            },
//            {
//                user: "{{user2}}",
//                content: { text: "", action: "CURRENT_NEWS" },
//            },
//        ],
//    ] as ActionExample[][]
//} as Action;
//