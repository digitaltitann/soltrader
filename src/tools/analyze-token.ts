import { PriceService } from '../services/price';
import { ToolResult } from '../types';

export async function analyzeToken(
  priceService: PriceService,
  params: { mint_address: string }
): Promise<ToolResult> {
  try {
    const analysis = await priceService.getTokenAnalysis(params.mint_address);
    if (!analysis) {
      return { success: false, error: `No data found for token ${params.mint_address}. It may be too new or not listed.` };
    }

    return {
      success: true,
      data: {
        mint: analysis.mint,
        symbol: analysis.symbol || 'UNKNOWN',
        name: analysis.name || 'Unknown Token',
        price_usd: analysis.priceUsd,
        price_in_sol: analysis.priceNative,
        volume_24h_usd: analysis.volume24h,
        liquidity_usd: analysis.liquidityUsd,
        price_change_24h_pct: analysis.priceChange24h,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
