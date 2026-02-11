import { Connection, Keypair } from '@solana/web3.js';
import { PositionManager } from '../positions';
import { ToolResult } from '../types';
import { getTokenBalance } from '../services/solana';
import { logInfo } from '../logger';
import { addActivity } from '../activity-log';

export async function syncPortfolio(
  positions: PositionManager,
  connection: Connection,
  wallet: Keypair
): Promise<ToolResult> {
  try {
    const openPositions = positions.getOpenPositions();
    let cleaned = 0;

    for (const pos of openPositions) {
      const balance = await getTokenBalance(connection, wallet.publicKey, pos.tokenMint);
      if (balance.rawAmount === BigInt(0)) {
        positions.closePhantom(pos.tokenMint, 'no tokens in wallet');
        positions.clearSeen(pos.tokenMint);
        cleaned++;
        addActivity('info', `Cleaned phantom position: ${pos.tokenSymbol || pos.tokenMint.slice(0, 8)} (no tokens found)`, {
          tokenMint: pos.tokenMint,
          tokenSymbol: pos.tokenSymbol,
        });
      }
    }

    const remaining = positions.getOpenPositions();
    logInfo(`Portfolio sync: cleaned ${cleaned} phantom positions, ${remaining.length} real positions remain`);

    return {
      success: true,
      data: {
        message: `Synced portfolio with on-chain data. Cleaned ${cleaned} phantom positions.`,
        phantom_positions_cleaned: cleaned,
        remaining_open_positions: remaining.length,
        positions: remaining.map(p => ({
          token: p.tokenSymbol || p.tokenMint.slice(0, 8),
          mint: p.tokenMint,
          entrySol: p.entrySol,
          status: p.status,
        })),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
