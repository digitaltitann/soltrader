import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { JupiterQuoteResponse, JupiterSwapResponse } from '../types';
import { logInfo, logTrade, logError } from '../logger';

const JUPITER_V6_BASE = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export class JupiterService {
  private connection: Connection;
  private wallet: Keypair;
  private slippageBps: number;
  private maxPriceImpactPct: number;

  constructor(connection: Connection, wallet: Keypair, slippageBps: number, maxPriceImpactPct: number) {
    this.connection = connection;
    this.wallet = wallet;
    this.slippageBps = slippageBps;
    this.maxPriceImpactPct = maxPriceImpactPct;
  }

  async getQuote(inputMint: string, outputMint: string, amountRaw: number): Promise<JupiterQuoteResponse> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: Math.floor(amountRaw).toString(),
      slippageBps: this.slippageBps.toString(),
    });

    const response = await fetch(`${JUPITER_V6_BASE}/quote?${params}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter quote failed (${response.status}): ${errorText}`);
    }
    return response.json() as Promise<JupiterQuoteResponse>;
  }

  async getSwapTransaction(quoteResponse: JupiterQuoteResponse): Promise<JupiterSwapResponse> {
    const body = {
      quoteResponse,
      userPublicKey: this.wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    };

    const response = await fetch(`${JUPITER_V6_BASE}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter swap failed (${response.status}): ${errorText}`);
    }
    return response.json() as Promise<JupiterSwapResponse>;
  }

  async executeSwap(swapResponse: JupiterSwapResponse): Promise<string> {
    const transactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuf);

    transaction.sign([this.wallet]);

    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: swapResponse.lastValidBlockHeight || latestBlockhash.lastValidBlockHeight,
      },
      'confirmed'
    );

    return signature;
  }

  async buyToken(tokenMint: string, solAmount: number): Promise<{ signature: string; quote: JupiterQuoteResponse }> {
    const amountLamports = Math.floor(solAmount * 1_000_000_000);
    logInfo(`Getting quote: ${solAmount} SOL -> ${tokenMint}`);

    const quote = await this.getQuote(SOL_MINT, tokenMint, amountLamports);

    const priceImpact = parseFloat(quote.priceImpactPct || '0');
    if (priceImpact > this.maxPriceImpactPct) {
      throw new Error(`Price impact too high: ${priceImpact}% (max: ${this.maxPriceImpactPct}%)`);
    }

    logInfo(`Quote received: ${solAmount} SOL -> ${quote.outAmount} tokens (impact: ${quote.priceImpactPct}%)`);

    const swapResponse = await this.getSwapTransaction(quote);
    const signature = await this.executeSwap(swapResponse);

    logTrade(`BUY executed: ${signature}`);
    return { signature, quote };
  }

  async sellToken(tokenMint: string, tokenAmountRaw: number): Promise<{ signature: string; quote: JupiterQuoteResponse }> {
    logInfo(`Getting sell quote: ${tokenAmountRaw} tokens -> SOL`);

    const quote = await this.getQuote(tokenMint, SOL_MINT, tokenAmountRaw);

    logInfo(`Sell quote: ${tokenAmountRaw} tokens -> ${Number(quote.outAmount) / 1_000_000_000} SOL`);

    const swapResponse = await this.getSwapTransaction(quote);
    const signature = await this.executeSwap(swapResponse);

    logTrade(`SELL executed: ${signature}`);
    return { signature, quote };
  }
}
