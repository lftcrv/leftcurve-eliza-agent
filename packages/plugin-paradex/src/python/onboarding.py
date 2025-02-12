import asyncio
import logging
import sys
import os
import traceback
import json
from typing import Dict, List

import aiohttp
from starknet_py.common import int_from_bytes
from utils import (
    build_onboarding_message,
    generate_paradex_account,
    get_account,
    get_l1_eth_account,
)
from shared.api_client import get_paradex_config

def get_paradex_urls() -> List[str]:
    return [
        "https://api.testnet.paradex.trade/v1",
        "https://api.prod.paradex.trade/v1"
    ]

async def perform_onboarding(
    paradex_config: Dict,
    paradex_http_url: str,
    account_address: str,
    private_key: str,
    ethereum_account: str,
) -> Dict:
    try:
        chain_id = int_from_bytes(paradex_config["starknet_chain_id"].encode())
        account = get_account(account_address, private_key, paradex_config)

        message = build_onboarding_message(chain_id)
        sig = account.sign_message(message)

        headers = {
            "PARADEX-ETHEREUM-ACCOUNT": ethereum_account,
            "PARADEX-STARKNET-ACCOUNT": account_address,
            "PARADEX-STARKNET-SIGNATURE": f'["{sig[0]}","{sig[1]}"]',
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        url = f"{paradex_http_url}/onboarding"
        body = {
            "public_key": hex(account.signer.public_key),
        }

        network = "testnet" if "testnet" in paradex_http_url else "prod"
        logging.info(f"Starting onboarding for {network}")
        logging.info(f"POST {url}")
        logging.info(f"Headers: {headers}")
        logging.info(f"Body: {body}")

        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=body) as response:
                status_code: int = response.status
                
                if status_code == 200:
                    logging.info(f"Onboarding successful on {network}")
                    return {
                        "success": True,
                        "network": network,
                        "account_address": account_address,
                        "ethereum_account": ethereum_account
                    }
                else:
                    error_text = await response.text()
                    logging.error(f"Status Code: {status_code}")
                    logging.error(f"Response Text: {error_text}")
                    return {
                        "success": False,
                        "network": network,
                        "error": f"HTTP {status_code}",
                        "details": error_text
                    }
    except Exception as e:
        logging.error(f"Onboarding error: {str(e)}")
        return {
            "success": False,
            "network": network if 'network' in locals() else "unknown",
            "error": str(e),
            "details": traceback.format_exc()
        }

async def onboard_all_networks(eth_private_key_hex: str) -> Dict:
    try:
        _, eth_account = get_l1_eth_account(eth_private_key_hex)
        results = []
        
        for paradex_http_url in get_paradex_urls():
            try:
                paradex_config = await get_paradex_config(paradex_http_url)
                
                paradex_account_address, paradex_account_private_key_hex = generate_paradex_account(
                    paradex_config, eth_account.key.hex()
                )

                result = await perform_onboarding(
                    paradex_config,
                    paradex_http_url,
                    paradex_account_address,
                    paradex_account_private_key_hex,
                    eth_account.address,
                )
                results.append(result)
            except Exception as e:
                logging.error(f"Error for {paradex_http_url}: {str(e)}")
                results.append({
                    "success": False,
                    "network": "testnet" if "testnet" in paradex_http_url else "prod",
                    "error": str(e),
                    "details": traceback.format_exc()
                })

        overall_success = any(r["success"] for r in results)
        return {
            "success": overall_success,
            "results": results
        }

    except Exception as e:
        logging.error("Main error")
        logging.error(str(e))
        return {
            "success": False,
            "error": str(e),
            "details": traceback.format_exc(),
            "results": []
        }

if __name__ == "__main__":
    logging.basicConfig(
        level=os.getenv("LOGGING_LEVEL", "INFO"),
        format="%(asctime)s.%(msecs)03d | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    eth_private_key_hex = (
        sys.argv[1] if len(sys.argv) > 1 else os.getenv("ETHEREUM_PRIVATE_KEY")
    )

    if not eth_private_key_hex:
        print(json.dumps({
            "success": False,
            "error": "No Ethereum private key provided"
        }))
        sys.exit(1)

    result = asyncio.run(onboard_all_networks(eth_private_key_hex))
    print(json.dumps(result))
    
    if not result["success"]:
        sys.exit(1)