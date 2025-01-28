import { getMarketsAction } from "../../actions/markets";
import { Memory, UUID } from "@elizaos/core";

async function main() {
    const mockRuntime = {} as any;
    const mockMessage: Memory = {
        userId: "12345678-1234-1234-1234-123456789abc" as UUID,
        agentId: "87654321-4321-4321-4321-cba987654321" as UUID,
        roomId: "abcdef12-3456-7890-abcd-ef1234567890" as UUID,
        content: {
            text: "Show me all available markets",
        },
    };

    const isValid = await getMarketsAction.validate(mockRuntime, mockMessage);
    console.log("Validation result:", isValid);

    if (isValid) {
        const markets = await getMarketsAction.handler(
            mockRuntime,
            mockMessage
        );
        console.log("\nAvailable Markets:");
        console.log(markets);
    }
}

main().catch(console.error);
