import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';
import { logInfo } from '../logger';

export function generateWallet(): { publicKey: string; privateKeyBase58: string } {
  const keypair = Keypair.generate();
  const privateKeyBase58 = bs58.encode(keypair.secretKey);
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKeyBase58,
  };
}

export function loadWallet(privateKeyBase58: string): Keypair {
  const secretKey = bs58.decode(privateKeyBase58);
  return Keypair.fromSecretKey(secretKey);
}

export async function getSolBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
  const lamports = await connection.getBalance(publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

export async function getTokenBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  mintAddress: string
): Promise<{ amount: number; rawAmount: bigint; decimals: number }> {
  const mint = new PublicKey(mintAddress);
  const ata = await getAssociatedTokenAddress(mint, walletPublicKey);
  try {
    const account = await getAccount(connection, ata);
    const decimals = (await connection.getParsedAccountInfo(mint)).value?.data
      ? ((await connection.getParsedAccountInfo(mint)).value?.data as any)?.parsed?.info?.decimals ?? 0
      : 0;
    return {
      amount: Number(account.amount) / Math.pow(10, decimals),
      rawAmount: account.amount,
      decimals,
    };
  } catch {
    return { amount: 0, rawAmount: BigInt(0), decimals: 0 };
  }
}

export function isValidSolanaMint(str: string): boolean {
  if (str.length < 32 || str.length > 44) return false;
  try {
    const decoded = bs58.decode(str);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

export function extractMintAddresses(text: string): string[] {
  const base58Regex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  const matches = text.match(base58Regex) || [];
  return matches.filter(isValidSolanaMint);
}

// CLI: generate wallet when run directly
if (require.main === module) {
  const wallet = generateWallet();
  console.log('\n=== New Solana Wallet Generated ===');
  console.log(`Public Key:  ${wallet.publicKey}`);
  console.log(`Private Key: ${wallet.privateKeyBase58}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`WALLET_PRIVATE_KEY=${wallet.privateKeyBase58}`);
  console.log(`\nSend SOL to: ${wallet.publicKey}`);
}
