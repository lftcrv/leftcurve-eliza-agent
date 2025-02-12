import asyncio
import json
import logging
import os
import sys
import time
import traceback
from decimal import Decimal, ROUND_DOWN
from shared.api_config import ApiConfig
from shared.paradex_api_utils import Order, OrderSide, OrderType
from shared.api_client import get_jwt_token, get_paradex_config, post_order_payload, sign_order
from utils import generate_paradex_account, get_l1_eth_account

def parse_order_params(params_json):
    params = json.loads(params_json)
    # Round size, todo
    size = Decimal(params['size']).quantize(Decimal('0.001'), rounding=ROUND_DOWN)
    return {
        'market': params['market'],
        'side': OrderSide.Buy if params['side'].lower() == 'buy' else OrderSide.Sell,
        'type': OrderType.Market if params['type'].lower() == 'market' else OrderType.Limit,
        'size': size,
        'client_id': params.get('clientId', f"order-{int(time.time())}")
    }

def build_order(config: ApiConfig, params) -> Order:
    order = Order(
        market=params['market'],
        order_type=params['type'],
        order_side=params['side'],
        size=params['size'],
        client_id=params['client_id'],
        signature_timestamp=int(time.time() * 1000)  # to milliseconds
    )
    
    order.signature = sign_order(config, order)
    return order

async def main():
    try:
        config = ApiConfig()
        config.paradex_http_url = os.getenv("PARADEX_API_URL", "https://api.testnet.paradex.trade/v1")
        config.ethereum_private_key = os.getenv("ETHEREUM_PRIVATE_KEY")
        
        if not config.ethereum_private_key:
            raise Exception("ETHEREUM_PRIVATE_KEY not set")

        order_params_json = os.getenv("ORDER_PARAMS")
        if not order_params_json:
            raise Exception("ORDER_PARAMS not set")
        
        logging.info(f"Received order parameters: {order_params_json}")
        order_params = parse_order_params(order_params_json)
        logging.info(f"Parsed order parameters: {order_params}")

        logging.info("Getting Paradex config...")
        config.paradex_config = await get_paradex_config(config.paradex_http_url)

        _, eth_account = get_l1_eth_account(config.ethereum_private_key)
        
        config.paradex_account, config.paradex_account_private_key = generate_paradex_account(
            config.paradex_config,
            eth_account.key.hex()
        )

        logging.info("Getting JWT token...")
        jwt_token = await get_jwt_token(
            config.paradex_config,
            config.paradex_http_url,
            config.paradex_account,
            config.paradex_account_private_key,
        )
        logging.info("JWT token obtained successfully")

        logging.info("Building order...")
        order = build_order(config, order_params)
        logging.info(f"Order built: {order}")
        
        logging.info("Placing order...")
        result = await post_order_payload(config.paradex_http_url, jwt_token, order.dump_to_dict())
        logging.info(f"Order placement result: {result}")

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
    logging.basicConfig(
        level=os.getenv("LOGGING_LEVEL", "INFO"),
        format="%(asctime)s.%(msecs)03d | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stderr
    )
    
    try:
        asyncio.run(main())
    except Exception as e:
        logging.error("Local Main Error", exc_info=True)
        sys.exit(1)
