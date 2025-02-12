#!/usr/bin/env python3
import asyncio
import json
import logging
import os
import sys
import time
import traceback
from typing import Dict, Optional
import aiohttp

from starknet_py.common import int_from_bytes
from utils import (
    build_auth_message,
    generate_paradex_account,
    get_account,
    get_l1_eth_account,
)
from shared.api_client import get_paradex_config

paradex_http_url = "https://api.testnet.paradex.trade/v1"

async def get_jwt_token(
    paradex_config: Dict,
    paradex_http_url: str,
    account_address: str,
    private_key: str
) -> Dict:
    try:
        chain_id = int_from_bytes(paradex_config["starknet_chain_id"].encode())
        account = get_account(account_address, private_key, paradex_config)

        now = int(time.time())
        expiry = now + 24 * 60 * 60  # 24 hours
        message = build_auth_message(chain_id, now, expiry)
        sig = account.sign_message(message)

        headers: Dict = {
            "PARADEX-STARKNET-ACCOUNT": account_address,
            "PARADEX-STARKNET-SIGNATURE": f'["{sig[0]}","{sig[1]}"]',
            "PARADEX-TIMESTAMP": str(now),
            "PARADEX-SIGNATURE-EXPIRATION": str(expiry),
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(f"{paradex_http_url}/auth", headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Failed to get JWT token. Status: {response.status}, Error: {error_text}")
                    
                response_data = await response.json()
                return {
                    "jwt_token": response_data["jwt_token"],
                    "expiry": expiry,
                    "account_address": account_address
                }
    except Exception as e:
        logging.error(f"Error getting JWT token: {str(e)}")
        raise

async def main(eth_private_key: str) -> None:
    try:
        # Initialize Ethereum account
        _, eth_account = get_l1_eth_account(eth_private_key)
        
        # Load Paradex config
        paradex_config = await get_paradex_config(paradex_http_url)
        
        # Generate Paradex account
        account_address, private_key = generate_paradex_account(
            paradex_config, 
            eth_account.key.hex()
        )
        
        # Get JWT token and account info
        result = await get_jwt_token(
            paradex_config,
            paradex_http_url,
            account_address,
            private_key
        )
        
        # Output result as JSON to stdout
        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(
        level=os.getenv("LOGGING_LEVEL", "INFO"),
        format="%(asctime)s.%(msecs)03d | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    
    # Get private key from argument or environment
    eth_private_key = sys.argv[1] if len(sys.argv) > 1 else os.getenv("ETHEREUM_PRIVATE_KEY")
    
    if not eth_private_key:
        error = {"error": "No Ethereum private key provided. Use argument or ETHEREUM_PRIVATE_KEY env var"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)
        
    try:
        asyncio.run(main(eth_private_key))
    except Exception as e:
        logging.error("Local Main Error")
        logging.error(e)
        traceback.print_exc()
        sys.exit(1)