
import { AccountResponseObject, FillResponseObject, OrderResponseObject, PositionResponseObject } from "@dydxprotocol/v3-client";

/* START- PERSONAL, YOU CAN CUSTOM */
export interface CreateOrderQuery {
    params: PartialBy<ApiOrder, 'clientId' | 'signature'>;
    positionId: string;
    genericParams?: GenericParams;
}
      
export interface MarketFeed {
    market_name: string;
    orderbook: Orderbook;
    latestBid: number;
    latestAsk: number;
}
/* END - PERSONAL, YOU CAN CUSTOM */

/* START - WS INFO AS interfaces */

export interface DataWSAccounts {
    type: 'subscribed' | 'channel_data',
    channel: string, // v3_accounts
    connection_id: string,
    id: string, // accountID
    contents: ContentsAccount
}

export interface ContentsAccount {
    fills: FillResponseObject[],
    orders: OrderResponseObject[],
    positions: PositionResponseObject[],
    accounts: AccountResponseObject[]
}

export interface DataWSOrderbook {
    type: 'subscribed' | 'channel_data',
    channel: string, // v3_orderbook
    connection_id: string,
    id: string, // market_name
    contents: ContentsOrderbook
}

export interface ContentsOrderbook {
    bids: any[], // you can upgrade this part ^^, just made it quickly
    asks: any[]
}
      
/* START - WS INFO AS interfaces */
