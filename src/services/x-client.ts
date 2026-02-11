import { TwitterApi, TwitterApiReadOnly } from 'twitter-api-v2';
import { ParsedTweet } from '../types';
import { extractMintAddresses } from './solana';
import { logInfo, logWarn } from '../logger';

export class XClient {
  private client: TwitterApiReadOnly;
  private processedTweetIds: Set<string> = new Set();
  private lastSeenTweetId?: string;

  constructor(bearerToken: string) {
    this.client = new TwitterApi(bearerToken).readOnly;
  }

  async searchTweets(query: string, minLikes: number = 50, minRetweets: number = 10): Promise<ParsedTweet[]> {
    const fullQuery = `${query} -is:retweet -is:reply lang:en`;
    const results: ParsedTweet[] = [];

    try {
      const response = await this.client.v2.search(fullQuery, {
        'tweet.fields': ['public_metrics', 'created_at', 'author_id'],
        'user.fields': ['username'],
        expansions: ['author_id'],
        max_results: 50,
        ...(this.lastSeenTweetId ? { since_id: this.lastSeenTweetId } : {}),
      });

      const users = new Map<string, string>();
      if (response.includes?.users) {
        for (const user of response.includes.users) {
          users.set(user.id, user.username);
        }
      }

      if (response.data?.data) {
        for (const tweet of response.data.data) {
          if (this.processedTweetIds.has(tweet.id)) continue;

          const metrics = tweet.public_metrics;
          if (!metrics) continue;

          const likes = metrics.like_count || 0;
          const retweets = metrics.retweet_count || 0;

          if (likes < minLikes || retweets < minRetweets) continue;

          const extractedMints = extractMintAddresses(tweet.text);

          this.processedTweetIds.add(tweet.id);

          results.push({
            id: tweet.id,
            text: tweet.text,
            authorUsername: users.get(tweet.author_id || '') || 'unknown',
            createdAt: tweet.created_at || '',
            likes,
            retweets,
            replies: metrics.reply_count || 0,
            extractedMints,
          });
        }

        // Update since_id for next poll
        if (response.data.data.length > 0) {
          this.lastSeenTweetId = response.data.data[0].id;
        }
      }

      logInfo(`X search: found ${results.length} matching tweets (query: "${query}")`);
    } catch (err: any) {
      logWarn(`X API error: ${err.message || err}`);
    }

    return results;
  }
}
