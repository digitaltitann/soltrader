import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { JupiterQuoteResponse, JupiterSwapResponse } from '../types';
import { logInfo, logTrade, logError } from '../logger';

const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export class JupiterService {
  private connection: Connection;
  private wallet: Keypair;
  private slippageBps: number;
  private maxPriceImpactPct: number;
  private apiKey: string;

  constructor(connection: Connection, wallet: Keypair, slippageBps: number, maxPriceImpactPct: number, apiKey: string) {
    this.connection = connection;
    this.wallet = wallet;
    this.slippageBps = slippageBps;
    this.maxPriceImpactPct = maxPriceImpactPct;
    this.apiKey = apiKey;
  }

  async getQuote(inputMint: string, outputMint: string, amountRaw: number): Promise<JupiterQuoteResponse> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: Math.floor(amountRaw).toString(),
      slippageBps: this.slippageBps.toString(),
    });

    const response = await fetch(`${JUPITER_API_BASE}/quote?${params}`, {
      headers: { 'x-api-key': this.apiKey },
    });
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
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1000000,
          priorityLevel: 'high',
        },
      },
    };

    const response = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
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
