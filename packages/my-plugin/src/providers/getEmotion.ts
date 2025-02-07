import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";

const randomEmotionProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        const characterName = _runtime.character?.name;

        const emotions: { [key: string]: string } = {
            happy: `${characterName} is feeling cheerful and optimistic.`,
            sad: `${characterName} is feeling downhearted and a bit melancholic.`,
            angry: `${characterName} is feeling irritated and a little frustrated.`,
            excited: `${characterName} is feeling enthusiastic and thrilled about something.`,
            calm: `${characterName} is feeling serene and at peace.`,
            confused: `${characterName} is feeling uncertain and puzzled about a situation.`,
            curious: `${characterName} is feeling eager to learn and discover something new.`,
            nervous: `${characterName} is feeling anxious and a bit apprehensive.`,
            grateful: `${characterName} is feeling thankful and appreciative of someone or something.`
        };

        const emotionKeys = Object.keys(emotions);
        const randomEmotionKey = emotionKeys[Math.floor(Math.random() * emotionKeys.length)];

        return emotions[randomEmotionKey];
    },
};

export { randomEmotionProvider };
