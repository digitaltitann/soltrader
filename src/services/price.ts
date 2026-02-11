import { TokenAnalysis } from '../types';
import { logInfo, logWarn } from '../logger';

const JUPITER_PRICE_API = 'https://price.jup.ag/v6/price';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

export class PriceService {
  async getTokenAnalysis(mint: string): Promise<TokenAnalysis | null> {
    // Try DexScreener first — it has richer data (liquidity, volume, name)
    try {
      const result = await this.getDexScreenerData(mint);
      if (result) return result;
    } catch (err) {
      logWarn(`DexScreener failed for ${mint}, trying Jupiter`);
    }

    // Fallback to Jupiter Price API
    try {
      return await this.getJupiterPrice(mint);
    } catch (err) {
      logWarn(`Jupiter price also failed for ${mint}`);
      return null;
    }
  }

  private async getDexScreenerData(mint: string): Promise<TokenAnalysis | null> {
    const resp = await fetch(`${DEXSCREENER_API}/${mint}`);
    if (!resp.ok) throw new Error(`DexScreener ${resp.status}`);

    const json: any = await resp.json();
    if (!json.pairs || json.pairs.length === 0) return null;

    // Pick the pair with highest liquidity
    const pair = json.pairs.sort(
      (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];

    return {
      mint,
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
      priceUsd: parseFloat(pair.priceUsd || '0'),
      priceNative: parseFloat(pair.priceNative || '0'),
      volume24h: pair.volume?.h24 || 0,
      liquidityUsd: pair.liquidity?.usd || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      timestamp: Date.now(),
    };
  }

  private async getJupiterPrice(mint: string): Promise<TokenAnalysis> {
    const params = new URLSearchParams({ ids: mint });
    const resp = await fetch(`${JUPITER_PRICE_API}?${params}`);
    if (!resp.ok) throw new Error(`Jupiter price ${resp.status}`);

    const json: any = await resp.json();
    const priceData = json.data?.[mint];
    if (!priceData) throw new Error('No price data from Jupiter');

    return {
      mint,
      symbol: priceData.mintSymbol,
      priceUsd: priceData.price || 0,
      priceNative: 0,
      volume24h: 0,
      liquidityUsd: 0,
      priceChange24h: 0,
      timestamp: Date.now(),
    };
  }
}
