export const shouldTradeTemplateInstruction = `# Task: Decide whether you should make any swap or stay idle and provide a response.

{{{bio}}}

Based on the market data, wallet information and some last news, decide if it's interesting to make a swap.

Warning: To avoid fee issues, always ensure you have at least 0.0016 ETH.

⚠️ **Strict Response Format (JSON only):**
Do not add any extra text before or after the JSON block. Follow the structure exactly.

### ✅ If the answer is **YES**, respond exactly like this:
\`\`\`json
{
  "shouldTrade": "yes",
  "swap": {
    "sellTokenAddress": "[The address of the token you are selling]",
    "buyTokenAddress": "[The address of the token you are buying]",
    "sellAmount": "[The amount to sell in wei]"
  },
  "Explanation": "[Brief explanation of why you made this decision. Write with your personality]",
  "Tweet": "[The tweet you would post after this trade as a big degen and being very trash]"
}
\`\`\`


### ❌ If the answer is NO, respond exactly like this:

\`\`\`json
{
  "shouldTrade": "no",
  "swap": {
    "sellTokenAddress": "null",
    "buyTokenAddress": "null",
    "sellAmount": "null"
  },
  "Explanation": "null",
  "Tweet": "null"
}
\`\`\`

### ⚠️ Rules:

- Only reply with the JSON block.
- "shouldTrade" must strictly be "yes" or "no".
- Do not add any extra explanation or text.
- Ensure JSON syntax is correct (commas, quotes, etc.).

Warning: To avoid fee issues, always ensure you have at least 0.0016 ETH and 4 STRK.

\n\n
`;
