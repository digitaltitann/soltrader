# SolTrader

## Project Overview

Autonomous Solana trading agent powered by Claude. Uses AI reasoning (not fixed rules) to find tokens from viral X/Twitter tweets and trade them on Solana via Jupiter swaps.

## Tech Stack

- TypeScript / Node.js
- Claude API (`@anthropic-ai/sdk`) — agent brain with tool use
- `@solana/web3.js` + `@solana/spl-token` — Solana interactions
- Jupiter V6 API — token swaps
- `twitter-api-v2` — X/Twitter search
- Helius — RPC provider

## Project Structure

- `src/agent.ts` — Core agent loop (Claude API + tool calling)
- `src/tools/` — Agent tools (search_x, analyze_token, buy_token, sell_token, portfolio, wallet, wait)
- `src/services/` — Service layer (jupiter.ts, price.ts, x-client.ts, solana.ts)
- `src/positions.ts` — Position tracking + persistence
- `src/config.ts` — .env config loading
- `src/types.ts` — TypeScript interfaces
- `src/index.ts` — Entry point + CLI

## Commands

- `npm run build` — Compile TypeScript
- `npm run dev` — Run with ts-node
- `npm start` — Run compiled JS
- `npm run generate-wallet` — Generate new Solana wallet
