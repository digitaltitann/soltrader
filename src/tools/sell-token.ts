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

    // Update position with real SOL P&L
    const position = positions.getPosition(mint);
    const solInvested = position ? position.entrySol * (pct / 100) : 0;
    const realPnlSol = solReceived - solInvested;
    const realPnlPct = solInvested > 0 ? (realPnlSol / solInvested) * 100 : 0;

    if (position) {
      if (pct >= 100) {
        positions.updatePosition(mint, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          tokenAmount: 0,
          pnlPct: realPnlPct,
          txSignatures: [...position.txSignatures, signature],
        });
      } else {
        const remaining = Number(tokenBalance.rawAmount) - sellAmountRaw;
        const remainingEntrySol = position.entrySol * ((100 - pct) / 100);
        positions.updatePosition(mint, {
          status: 'partial',
          tokenAmount: remaining,
          entrySol: remainingEntrySol,
          txSignatures: [...position.txSignatures, signature],
        });
      }
    }

    const pnlSign = realPnlSol >= 0 ? '+' : '';
    logTrade(`Sold ${pct}% of ${mint} | Invested: ${solInvested.toFixed(4)} SOL | Received: ${solReceived.toFixed(4)} SOL | Real P&L: ${pnlSign}${realPnlSol.toFixed(4)} SOL (${pnlSign}${realPnlPct.toFixed(1)}%) | tx: ${signature}`);
    addActivity('sell', `Sold ${pct}% of ${position?.tokenSymbol || mint.slice(0, 8)} for ${solReceived.toFixed(4)} SOL (${pnlSign}${realPnlSol.toFixed(4)} SOL P&L)`, {
      tokenMint: mint,
      tokenSymbol: position?.tokenSymbol,
      solAmount: solReceived,
      txSignature: signature,
      pnlPct: realPnlPct,
    });

    return {
      success: true,
      data: {
        message: `Sold ${pct}% of ${position?.tokenSymbol || mint}`,
        sol_invested: solInvested,
        sol_received: solReceived,
        real_pnl_sol: realPnlSol,
        real_pnl_pct: `${pnlSign}${realPnlPct.toFixed(2)}%`,
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
