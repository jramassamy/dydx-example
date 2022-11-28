import { Controller, Get } from '@nestjs/common';

import * as WebSocket from 'ws';

import { DydxClient, Market, OrderResponseObject, OrderSide, OrderStatus, OrderType, TimeInForce } from '@dydxprotocol/v3-client';
import { CreateOrderQuery, MarketFeed } from './dydx-trading-logic/models/data.model';
import { RequestMethod } from '@dydxprotocol/v3-client/build/src/lib/axios';
import { DataWSAccounts } from './dydx-trading-logic/models/websocket.model';

const HTTP_HOST_STARKNET_PROD = 'https://api.dydx.exchange';
const NETWORK_ID_STARKNET_PROD = 1;

const HTTP_HOST_GOERLI_DEV = 'https://api.stage.dydx.exchange';
const NETWORK_ID_GOERLI_DEV = 5;

const WS_HOST_TESTNET = 'wss://api.stage.dydx.exchange/v3/ws';
const WS_HOST_MAINNET = 'wss://api.dydx.exchange/v3/ws';

/*EXAMPLE FOR NESTJS, using Typescript, just remove the @Controller if you want simple Typescript class*/
@Controller()
export class AppController {
 // ne pas oublier de désactiver la prod sinon les websockets seront en doublons
  dydxWS: WebSocket;
  market: Map<string, MarketFeed> = new Map<string, MarketFeed>();

  LOGGER = {
    WS_ORDERBOOK: 'enabled',
    WS_ACCOUNT: 'disabled',
    WS_MARKET: 'disabled',
    API_RESPONSE: 'enabled',
    WS_RESET_INFO: 'enabled',
    ERRORS: 'disabled',
    DEBUG_DEV: 'enabled'
  }

  ETH_ADDRESS = 'ENTER_YOUR_INFO';

  client: DydxClient = new DydxClient(
    HTTP_HOST_GOERLI_DEV,
    {
      apiTimeout: 3000,
      starkPrivateKey: 'ENTER_YOUR_INFO',
      apiKeyCredentials: {
        key: 'ENTER_YOUR_INFO',
        secret: 'ENTER_YOUR_INFO',
        passphrase: 'ENTER_YOUR_INFO'
      },
      networkId: NETWORK_ID_GOERLI_DEV
    },
  );

  constructor() {
    this.initSystem();
  }

  async initSystem() {
    await this.initAccountIDs();
    this.initMarketsFeed();
    this.initWS();
    // setTimeout(()=> {
    //  this.testOrderBuyBTC();
    // }, 3000);
  }

  createExpirationDate() {
    const currentDate = new Date();
    const dateExpiration = new Date(currentDate.setDate(currentDate.getDate() + 3));
    const dateExpirationISOString = dateExpiration.toISOString();
    return dateExpirationISOString;
  }


  async initAccountIDs() {
    this.retrieveAccount();
  }

  async testOrderBuyBTC() {
    const client_account_info = await this.client.private.getAccount(this.ETH_ADDRESS);
    /*  LIMIT EXAMPLE:
        params: {
          side: OrderSide.BUY,
          type: OrderType.LIMIT,
          timeInForce: TimeInForce.GTT,
          postOnly: true,
          size: '0.02',
          price: '16392',
          limitFee: '0.05',
          expiration: this.createExpirationDate(),
          market: Market.BTC_USD,
        }
     */
    const createOrderQuery: CreateOrderQuery = { // MARKET EXAMPLE
      params: {
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        timeInForce: TimeInForce.GTT,
        postOnly: false,
        size: '0.02',
        price: (this.market.get(Market.BTC_USD).latestBid + 1000).toString(),
        limitFee: '0.05',
        expiration: this.createExpirationDate(),
        market: Market.BTC_USD,
      },
      positionId: client_account_info.account.positionId,
      genericParams: null
    }
    await this.createOrder(createOrderQuery);
  }

  //#region DYDX_API_CREATE_ORDER
  async createOrder(createOrderQuery: CreateOrderQuery, update: boolean = false, cancelID: string = ''):  Promise<OrderResponseObject> {
    if (update === true) {
      createOrderQuery.params.cancelId = cancelID; // update a trade
    }
    const orderResponse: { order: OrderResponseObject } = await this.client.private.createOrder(
      createOrderQuery.params,
      createOrderQuery.positionId,
      createOrderQuery.genericParams
    );
    return await this.retrieveOrderById(orderResponse.order.id);
  }
  //#endregion DYDX_API_CREATE_ORDER

  //#region DYDX_API_READ_ORDERS
  async retrieveAccount() {
    const client_account_info = await this.client.private.getAccount(this.ETH_ADDRESS);
    this.console_log(`account info ${client_account_info.account.id}`, this.LOGGER.API_RESPONSE);
  }

  async retrieveAllOrders() {
    const allOrders: { orders: OrderResponseObject[] } = await this.client.private.getOrders(
      {
        market: Market.BTC_USD,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        limit: 50,
      },
    );
    this.console_log(`retrieveAllOrders ${allOrders}`, this.LOGGER.API_RESPONSE);
  }

  // CANCELED: "not created" | OPEN: "let's update it" | FILLED: Filled
  async retrieveOrderById(id: string): Promise<OrderResponseObject> {
    const query: { order: OrderResponseObject } = await this.client.private.getOrderById(id);
    return query.order;
  }
  //#endregion DYDX_API_READ_QUERIES

  //#region SECURE_WEBSOCKET_CONNECTION_SYSTEM
  latestTimestampWS = new Date();

  async init_10S_Timer_Interval() {
    this.latestTimestampWS = new Date();
    const interval_10S_timer = setInterval(() => {
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate.getTime() - this.latestTimestampWS.getTime());
      const oneSecondLater = diffTime > 10000;
      if (oneSecondLater) {
        this.console_log(`reset market ${new Date()}`, this.LOGGER.WS_RESET_INFO);
        clearInterval(interval_10S_timer);
        this.initWS();
        return;
      }
    }, 10000);
  }
  //#endregion SECURE_WEBSOCKET_CONNECTION_SYSTEM

  //#region INIT_WS_CHANNELS
  initWSChannelOrderbook() {
    let initializer = {
      type: 'subscribe',
      channel: 'v3_orderbook',
      id: null,
      includeOffsets: true
    };
    initializer.id = Market.BTC_USD;
    this.dydxWS.send(JSON.stringify(initializer));
    initializer.id = Market.ETH_USD;
    this.dydxWS.send(JSON.stringify(initializer));
  }

  initWSChannelAccounts() {
    const timestamp = new Date().toISOString();
    const signature = this.client.private.sign({
      requestPath: "/ws/accounts",
      method: RequestMethod.GET,
      isoTimestamp: timestamp,
    });

    const initializer = {
      type: "subscribe",
      channel: "v3_accounts",
      accountNumber: "0",
      apiKey: this.client.apiKeyCredentials.key,
      signature: signature,
      timestamp: timestamp,
      passphrase: this.client.apiKeyCredentials.passphrase,
    };
    this.dydxWS.send(JSON.stringify(initializer));
  }

  initWSChannels() {
    this.initWSChannelOrderbook();
    this.initWSChannelAccounts();
  }
  //#endregion INIT_WS_CHANNELS

  async initWS() {
    if (this.dydxWS) {
      this.dydxWS.close();
      this.dydxWS = null;
    }

    this.dydxWS = await new WebSocket(WS_HOST_TESTNET);

    this.dydxWS.onopen = async () => {
      this.init_10S_Timer_Interval();
      this.initWSChannels()
    };

    this.dydxWS.onmessage = (event) => {

      this.latestTimestampWS = new Date();

      const data = JSON.parse(event.data.toString());
      switch (data.channel) {
        case "v3_accounts":
          this.handleV3Accounts(data);
          break;
        case "v3_markets":
          this.handleV3Markets(data);
          break;
        case "v3_orderbook":
          this.handleV3Orderbook(data);
          break;
      }
    };

    this.dydxWS.onerror = (event) => {
      this.console_log(`dydxWS onerror ${new Date()}, ${JSON.stringify(event)}`, this.LOGGER.ERRORS);
    };

    this.dydxWS.onclose = (event) => {
      this.console_log(`dydxWS onclose ${new Date()}, ${JSON.stringify(event)}`, this.LOGGER.WS_RESET_INFO);
    };

  }

  handleV3Accounts(data: DataWSAccounts) {
    if (data.type === 'subscribed') {
      this.console_log(`accounts sub ${data}`, this.LOGGER.WS_ACCOUNT);
    }
    if(data.type === 'channel_data') {
      console.log(data.contents.orders);
      console.log('\n\n\n\n\n\nNEXT\n\n\n\n\n');
      // this.console_log(`accounts data order ${JSON.stringify(data)}`, this.LOGGER.DEBUG_DEV);
    }
  }

  console_log(text: any, logger: string) {
    if(logger === 'enabled') {
      console.log(text);
    }
  }

  handleV3Markets(data) {

  }

 // ne pas oublier de désactiver la prod sinon les websockets seront en doublons
  handleV3Orderbook(data) {
    const market_name = data.id;
    let m =  this.market.get(market_name);
    if (data.type === 'subscribed') { // TO-FIX, message_id n'est pas tjr 1 si plusieurs 
      m.orderbook.bids = data.contents.bids.filter((i) => +i.size !== 0);
      m.orderbook.asks = data.contents.asks.filter((i) => +i.size !== 0);
      for (let bid of m.orderbook.bids) {
        bid.offset = +bid.offset;
        bid.price = +bid.price;
        bid.size = +bid.size;
      }
      for (let ask of m.orderbook.asks) {
        ask.offset = +ask.offset;
        ask.price = +ask.price;
        ask.size = +ask.size;
      }
      this.retrieveLatestPriceByMarket('all', m);
    } 
    if (data.type === 'channel_data') {
      if (data?.contents) {
        this.updateOrderbook(data, m);
      }
    }
  }

  updateOrderbook(data, m: MarketFeed) {
    const offset = data.contents.offset;
    if (data?.contents?.bids?.length) {
      const bids = data.contents.bids;
      for (let bid of bids) {
        this.verifyThenUpdateOrderbook(bid, 'bids', +offset, m);
      }
    }
    if (data?.contents?.asks?.length) {
      const asks = data.contents.asks;
      for (let ask of asks) {
        this.verifyThenUpdateOrderbook(ask, 'asks', +offset, m);
      }
    }
  }

  verifyThenUpdateOrderbook(bidOrAsk: [number, number], type: 'bids' | 'asks', offset: number, m: MarketFeed) {
    let updateBTCPrices = false;
    const currentdate = new Date();
    const datetime = currentdate.getHours() + "h"
      + currentdate.getMinutes() + "m"
      + currentdate.getSeconds() + "s";
    let [price, size] = bidOrAsk;
    price = +price;
    size = +size;

    let latestBidOrAsk = -1;

    if (type === 'bids') {
      latestBidOrAsk = m.latestBid;
    }
    if (type === 'asks') {
      latestBidOrAsk = m.latestAsk;
    }

    let exists = m.orderbook[`${type}`].find(
      (bid_or_ask) => bid_or_ask.price === price
    );

    if (exists) {
      if (offset > exists.offset) {
        exists.size = size;
        exists.offset = offset;

        if (exists.size === 0 && exists.price === latestBidOrAsk) {
          updateBTCPrices = true;
        }
      }
    }
    else {
      if (type === 'asks') {
        if (price < m.latestAsk && size !== 0) {
          m.latestAsk = price;
          this.console_log(`new from feed, ask (red) ${m.latestAsk} ${datetime} ${m.market_name}`, this.LOGGER.WS_ORDERBOOK);
        }
      }
      if (type === 'bids') {
        if (price > m.latestBid && size !== 0) {
          m.latestBid = price;
          this.console_log(`new from feed, bid (green) ${m.latestBid} ${datetime} ${m.market_name}`, this.LOGGER.WS_ORDERBOOK);
        }
      }
      m.orderbook[`${type}`].push({ price: price, size: size, offset: offset });
    }

    if (updateBTCPrices) {
      this.retrieveLatestPriceByMarket(type, m);
    }
  }

  initMarketsFeed() {
    const market_name_list: string[] = [Market.BTC_USD.toString(), Market.ETH_USD.toString()];

    for (let market_name of market_name_list) {
      const marketFeed: MarketFeed = {
        market_name: market_name,
        orderbook: {
          bids: [],
          asks: []
        },
        latestAsk: -1,
        latestBid: -1
      }
      this.market.set(market_name, marketFeed);
    }

  }

  retrieveLatestPriceByMarket(type: 'bids' | 'asks' | 'all', m: MarketFeed) {
    const currentdate = new Date();
    const datetime = currentdate.getHours() + "h"
    + currentdate.getMinutes() + "m"
    + currentdate.getSeconds() + "s";
    if (type === 'bids' || type === 'all') {
      m.orderbook.bids = m.orderbook.bids.filter((i) => +i.size !== 0);
      const bids = m.orderbook.bids.map((a) => a.price);
      m.latestBid = Math.max(...bids);
      this.console_log(`new bid (green) ${m.latestBid} ${datetime} ${m.market_name}`, this.LOGGER.WS_ORDERBOOK);
    }
    if (type === 'asks' || type === 'all') {
      m.orderbook.asks = m.orderbook.asks.filter((i) => +i.size !== 0);
      const asks = m.orderbook.asks.map((a) => a.price);
      m.latestAsk = Math.min(...asks);
      this.console_log(`new ask (red) ${m.latestAsk} ${datetime} ${m.market_name}`, this.LOGGER.WS_ORDERBOOK);
    }
  }
}
