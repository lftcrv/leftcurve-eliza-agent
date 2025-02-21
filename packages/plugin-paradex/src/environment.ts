import type { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

export const paradexEnvSchema = z.object({
   PARADEX_NETWORK: z.enum(["testnet", "prod"]),
   PARADEX_ACCOUNT_ADDRESS: z.string().min(1, "Paradex account address is required"),
   PARADEX_PRIVATE_KEY: z.string().min(1, "Paradex private key is required"),
   ETHEREUM_ACCOUNT_ADDRESS: z.string().min(1, "Ethereum account address is required"),
});

export type ParadexConfig = z.infer<typeof paradexEnvSchema>;

export async function validateParadexConfig(
   runtime: IAgentRuntime
): Promise<ParadexConfig> {
   try {
       const config = {
           PARADEX_NETWORK: 
               runtime.getSetting("PARADEX_NETWORK") || 
               process.env.PARADEX_NETWORK,
           PARADEX_ACCOUNT_ADDRESS:
               runtime.getSetting("PARADEX_ACCOUNT_ADDRESS") ||
               process.env.PARADEX_ACCOUNT_ADDRESS,
           PARADEX_PRIVATE_KEY:
               runtime.getSetting("PARADEX_PRIVATE_KEY") ||
               process.env.PARADEX_PRIVATE_KEY,
           ETHEREUM_ACCOUNT_ADDRESS:
               runtime.getSetting("ETHEREUM_ACCOUNT_ADDRESS") ||
               process.env.ETHEREUM_ACCOUNT_ADDRESS,
       };

       return paradexEnvSchema.parse(config);
   } catch (error) {
       if (error instanceof z.ZodError) {
           const errorMessages = error.errors
               .map((err) => `${err.path.join(".")}: ${err.message}`)
               .join("\n");
           throw new Error(
               `Paradex configuration validation failed:\n${errorMessages}`
           );
       }
       throw error;
   }
}