import { Connection, Keypair } from '@solana/web3.js';
import { JupiterService } from '../services/jupiter';
import { PositionManager } from '../positions';
import { ToolResult } from '../types';
import { getTokenBalance } from '../services/solana';
import { logTrade, logWarn } from '../logger';
import { addActivity } from '../activity-log';

export async function sellToken(
  jupiter: JupiterService,
  positions: PositionManager,
  connection: Connection,
  wallet: Keypair,
  params: { mint_address: string; percentage?: number }
): Promise<ToolResult> {
  try {
    const mint = params.mint_address;
    const pct = Math.min(100, Math.max(1, params.percentage ?? 100));

    // Get actual token balance from chain
    const tokenBalance = await getTokenBalance(connection, wallet.publicKey, mint);
    if (tokenBalance.rawAmount === BigInt(0)) {
      return { success: false, error: `No tokens found for ${mint} in wallet` };
    }

    const sellAmountRaw = Number(tokenBalance.rawAmount * BigInt(pct) / BigInt(100));
    if (sellAmountRaw === 0) {
      return { success: false, error: 'Sell amount too small' };
    }

    // Execute sell
    const { signature, quote } = await jupiter.sellToken(mint, sellAmountRaw);
    const solReceived = Number(quote.outAmount) / 1_000_000_000;

    // Update position
    const position = positions.getPosition(mint);
    if (position) {
      if (pct >= 100) {
        positions.updatePosition(mint, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          tokenAmount: 0,
          txSignatures: [...position.txSignatures, signature],
        });
      } else {
        const remaining = Number(tokenBalance.rawAmount) - sellAmountRaw;
        positions.updatePosition(mint, {
          status: 'partial',
          tokenAmount: remaining,
          txSignatures: [...position.txSignatures, signature],
        });
      }
    }

    logTrade(`Sold ${pct}% of ${mint} | Received ${solReceived} SOL | tx: ${signature}`);
    addActivity('sell', `Sold ${pct}% of ${position?.tokenSymbol || mint.slice(0, 8)} for ${solReceived.toFixed(4)} SOL`, {
      tokenMint: mint,
      tokenSymbol: position?.tokenSymbol,
      solAmount: solReceived,
      txSignature: signature,
      pnlPct: position?.pnlPct,
    });

    return {
      success: true,
      data: {
        message: `Sold ${pct}% of ${position?.tokenSymbol || mint}`,
        sol_received: solReceived,
        percentage_sold: pct,
        tx_signature: signature,
        solscan_url: `https://solscan.io/tx/${signature}`,
      },
    };
  } catch (err: any) {
    logWarn(`Sell failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}
