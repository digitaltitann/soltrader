import { Connection, Keypair } from '@solana/web3.js';
import { getSolBalance } from '../services/solana';
import { ToolResult } from '../types';

export async function getWalletBalance(
  connection: Connection,
  wallet: Keypair
): Promise<ToolResult> {
  try {
    const balance = await getSolBalance(connection, wallet.publicKey);
    return {
      success: true,
      data: {
        public_key: wallet.publicKey.toBase58(),
        sol_balance: balance,
        sol_balance_usd_approx: null, // Could fetch SOL price, but not critical
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
