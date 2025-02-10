import {
    ActionExample,
    composeContext,
    Content,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    Provider,
    State,
    type Action,
} from "@elizaos/core";

async function getCurrentNews(searchTerm : string){
    const apiKey = "1809642513d84b009fe12de73a3af77f";
    const response = await fetch(`https://newsapi.org/v2/everything?q=${searchTerm}&apiKey=${apiKey}`);
    const data = await response.json();
    return data.articles.slice(0, 5).map(article => `${article.title}\n${article.description}\n${article.url}\n${article.content.slice(0,1000)}`).join("\n\n");
    //return data;
}

const currentNewsProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) =>{

        const context = `Extract the search term from the user's message. The message is:
        ${_message.content.text}

        Only respond with the search term, do not include any other text.`;

        const searchTerm = await generateText({
            runtime: _runtime,
            context,
            modelClass: ModelClass.SMALL,
            stop: ["\n"],

        })

        const CurrentNews = await getCurrentNews(searchTerm);


        const currentNewsContext = `Respond by providing a summary of the following current news. This summary will be included in an LLM prompt.
        The current News :
        ${CurrentNews}
`;

        const response = await generateText({
            runtime: _runtime,
            context : currentNewsContext,
            modelClass: ModelClass.SMALL,
            stop: ["\n"],

        })


        const responseText =
            "# Here are some news updates regarding Bitcoin or Ethereum market sentiment and institutional investments:\n" +
            response;

        return responseText;
    },
};

export {currentNewsProvider};
