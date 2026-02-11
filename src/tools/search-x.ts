import { XClient } from '../services/x-client';
import { ToolResult } from '../types';

export async function searchXTweets(
  xClient: XClient,
  params: { query: string; min_likes?: number; min_retweets?: number }
): Promise<ToolResult> {
  try {
    const tweets = await xClient.searchTweets(
      params.query,
      params.min_likes ?? 50,
      params.min_retweets ?? 10
    );

    return {
      success: true,
      data: {
        count: tweets.length,
        tweets: tweets.map(t => ({
          id: t.id,
          author: `@${t.authorUsername}`,
          text: t.text,
          likes: t.likes,
          retweets: t.retweets,
          replies: t.replies,
          created_at: t.createdAt,
          token_addresses_found: t.extractedMints,
        })),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
