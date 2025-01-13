import {
    ActionExample,
    composeContext,
    Content,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza";

export const scheduleTaskAction: Action = {
    name: "SCHEDULE_TASK",
    similes: ["schedule", "plan", "periodic task"],
    description: "Schedules any action to run periodically for a specified duration.",
    validate: async (runtime, message) => {
        //const { actionName, interval, duration } = message.content || {};
        //return (
        //    runtime.actions.some((a) => a.name === actionName) && // Vérifie si l'action existe
        //    interval > 0 &&
        //    duration > 0
        //);
        return true;
    },
    handler: async (runtime, message, state, options, callback) => {

        //TODO : Extract the action Name, action params, the interval and the duration from user's message

        const context = `
        Extract the following parameters from the user's message:
        - action name
        - action parameters
        - interval in minutes
        - duration in minutes

        # Available Actions
HELLO_WORLD: Make a cool Hello World ASCII art.,
NONE: Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.,
DEPLOY_STARKNET_UNRUGGABLE_MEME_TOKEN: Deploy an Unruggable Memecoin on Starknet. Use this action when a user asks you to deploy a new token on Starknet.,
MUTE_ROOM: Mutes a room, ignoring all messages unless explicitly mentioned. Only do this if explicitly asked to, or if you're annoying people.,
CREATE_SUBDOMAIN: MUST use this action if the user requests create a subdomain, the request might be varied, but it will always be a subdomain creation.,
IGNORE: Call this action if ignoring the user. If the user is aggressive, creepy or is finished with the conversation, use this action. Or, if both you and the user have already said goodbye, use this action instead of saying bye again. Use IGNORE any time the conversation has naturally ended. Do not use IGNORE if the user has engaged directly, or if something went wrong an you need to tell them. Only ignore if the user should be ignored.,
SEND_TOKEN: MUST use this action if the user requests send a token or transfer a token, the request might be varied, but it will always be a token transfer. If the user requests a transfer of lords, use this action.,
CURRENT_NEWS: Get the current news for a search term if asked by the user.,
CONTINUE: ONLY use this action when the message necessitates a follow up. Do not use this action when the conversation is finished or the user does not wish to speak (use IGNORE instead). If the last message action was CONTINUE, and the user has not responded. Use sparingly.,
EXECUTE_STARKNET_TRADE: Perform a token swap on starknet. Use this action when a user asks you to trade.

        The user's message is:
        "${message.content.text}"

        Only respond with a JSON object containing these parameters in the format:
        {
            "actionName": "ACTION_NAME",
            "actionParams": { /* parameters */ },
            "interval": INTERVAL_IN_MINUTES,
            "duration": DURATION_IN_MINUTES
        }

        as exemple:
    {
        "actionName": "CURRENT_NEWS",
        "actionParams": { "topic": "AI" },
        "interval": 1,
        "duration": 60
    }
    `;


    const extractedParams = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
        stop: ["\n"],
    });

    let params;
    try {
        params = JSON.parse(extractedParams);
        if (!params.actionName || !params.interval || !params.duration) {
            throw new Error("Missing required parameters.");
        }
    } catch (error) {
        throw new Error("Failed to parse extracted parameters: " + extractedParams);
    }

    const { actionName, actionParams = {}, interval, duration } = params;

    const action = runtime.actions.find((a) => a.name === actionName);
    if (!action) {
        throw new Error(`Action "${actionName}" not found`);
    }

    // Générer un message minimal si aucun paramètre n'est requis
    const clonedMessage = {
        userId: message.userId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        content: {
            text: actionParams.text || "", // Texte vide si aucun paramètre
            ...actionParams.content,
        },
    };

    const endTime = Date.now() + duration * 60 * 1000;

    const intervalId = setInterval(async () => {
        try {
            if (Date.now() > endTime) {
                clearInterval(intervalId);
                return;
            }

            console.log(`Executing scheduled action "${actionName}"`);

            await action.handler(runtime, actionParams, state, options, callback);
        } catch (error) {
            console.error(`Error executing scheduled action "${actionName}":`, error);
            clearInterval(intervalId);
        }
    }, interval * 60 * 1000);

    callback({
        text: `Scheduled action "${actionName}" every ${interval} minutes for ${duration} minutes.`,
    });

    return true;
},

examples: [
    [
        {
            user: "{{user1}}",
            content: {
                text: "Call the HELLO_WORLD action every 2 minutes for 10 minutes.",
                action: "SCHEDULE_TASK",
                actionName: "HELLO_WORLD",
                interval: 2,
                duration: 10,
            },
        },
        {
            user: "{{user2}}",
            content: {
                text: 'Scheduled action "HELLO_WORLD" every 2 minutes for 10 minutes.',
            },
        },
    ],

    [
        {
            user: "{{user1}}",
            content: {
                text: "Give me news about AI every 5 minutes for 1 hour.",
                action: "SCHEDULE_TASK",
                actionName: "CURRENT_NEWS",
                actionParams: { content: { text: "AI" } },
                interval: 5,
                duration: 60,
            },
        },
        {
            user: "{{user2}}",
            content: {
                text: 'Scheduled action "CURRENT_NEWS" every 5 minutes for 60 minutes.',
            },
        },
    ],

    [
        {
            user: "{{user1}}",
            content: {
                text: "Run the IGNORE action every 1 minute for 5 minutes.",
                action: "SCHEDULE_TASK",
                actionName: "IGNORE",
                interval: 1,
                duration: 5,
            },
        },
        {
            user: "{{user2}}",
            content: {
                text: 'Scheduled action "IGNORE" every 1 minute for 5 minutes.',
            },
        },
    ]
],

};
