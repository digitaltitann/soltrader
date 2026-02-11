import { ParsedTweet } from '../types';
import { extractMintAddresses } from './solana';
import { logInfo, logWarn } from '../logger';

const TWITTER_API_BASE = 'https://api.twitterapi.io/twitter/tweet/advanced_search';

interface TwitterApiTweet {
  id: string;
  text: string;
  url: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number;
  createdAt: string;
  author: {
    userName: string;
    name: string;
    followers: number;
    isBlueVerified: boolean;
  };
  entities?: {
    urls?: Array<{ expanded_url: string }>;
    hashtags?: Array<{ text: string }>;
    user_mentions?: Array<{ screen_name: string }>;
  };
}

interface TwitterApiResponse {
  tweets: TwitterApiTweet[];
  has_next_page: boolean;
  next_cursor: string;
}

export class XClient {
  private apiKey: string;
  private seenTweetIds: Set<string> = new Set();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchTweets(query: string, minLikes: number = 50, minRetweets: number = 10): Promise<ParsedTweet[]> {
    const results: ParsedTweet[] = [];

    try {
      // Fetch up to 2 pages (40 tweets max)
      let cursor = '';
      const maxPages = 2;

      for (let page = 0; page < maxPages; page++) {
        const params = new URLSearchParams({
          query,
          queryType: 'Top',
          cursor,
        });

        const response = await fetch(`${TWITTER_API_BASE}?${params}`, {
          headers: { 'X-API-Key': this.apiKey },
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`TwitterAPI.io ${response.status}: ${errText}`);
        }

        const json = await response.json() as TwitterApiResponse;

        if (!json.tweets || json.tweets.length === 0) break;

        for (const tweet of json.tweets) {
          // Skip already seen tweets
          if (this.seenTweetIds.has(tweet.id)) continue;
          this.seenTweetIds.add(tweet.id);

          // Filter by engagement
          if (tweet.likeCount < minLikes && tweet.retweetCount < minRetweets) continue;

          // Extract Solana addresses from tweet text AND expanded URLs
          let fullText = tweet.text;
          if (tweet.entities?.urls) {
            for (const u of tweet.entities.urls) {
              if (u.expanded_url) fullText += ' ' + u.expanded_url;
            }
          }
          const extractedMints = extractMintAddresses(fullText);

          results.push({
            id: tweet.id,
            text: tweet.text,
            authorUsername: tweet.author?.userName || 'unknown',
            createdAt: tweet.createdAt || new Date().toISOString(),
            likes: tweet.likeCount || 0,
            retweets: tweet.retweetCount || 0,
            replies: tweet.replyCount || 0,
            extractedMints,
          });
        }

        // Paginate if more results
        if (!json.has_next_page || !json.next_cursor) break;
        cursor = json.next_cursor;
      }

      logInfo(`X search: found ${results.length} tweets with ${results.reduce((s, t) => s + t.extractedMints.length, 0)} mints (query: "${query}")`);
    } catch (err: any) {
      logWarn(`TwitterAPI.io error: ${err.message || err}`);
    }

    return results;
  }

  clearSeenCache(): void {
    this.seenTweetIds.clear();
  }
}
