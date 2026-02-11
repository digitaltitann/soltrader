import { ParsedTweet } from '../types';
import { extractMintAddresses } from './solana';
import { logInfo, logWarn } from '../logger';

const XAI_API_URL = 'https://api.x.ai/v1/responses';

interface XAIResponse {
  output?: Array<{
    type: string;
    content?: string | Array<{ type: string; text?: string }>;
    tool_calls?: Array<{ type: string; results?: any[] }>;
  }>;
  citations?: string[];
}

export class XClient {
  private apiKey: string;
  private seenTexts: Set<string> = new Set();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchTweets(query: string, minLikes: number = 50, minRetweets: number = 10): Promise<ParsedTweet[]> {
    const results: ParsedTweet[] = [];

    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout

      const response = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'grok-4-1-fast',
          input: [
            {
              role: 'user',
              content: `Search X/Twitter for: ${query}

Find the most viral and trending posts from the last 24 hours (${yesterday} to ${today}).

CRITICAL FORMAT: Return each tweet as a SINGLE LINE in this exact format:
TWEET|@username|tweet text here all on one line|likes|retweets|replies

RULES:
- Each TWEET must be on ONE SINGLE LINE — no line breaks inside the tweet text
- Replace any newlines in the tweet text with spaces
- Keep ALL contract addresses complete (base58 strings, 32-44 chars) — never truncate them
- Focus on Solana tokens: contract addresses, $TICKER symbols, pump.fun links, token names
- Include tweets about memecoins, new launches, trending tokens, airdrops
- Return 5-10 tweets sorted by engagement
- Return ONLY TWEET| lines, no other commentary`,
            },
          ],
          tools: [
            {
              type: 'x_search',
              from_date: yesterday,
              to_date: today,
            },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`xAI API ${response.status}: ${errText}`);
      }

      const json = await response.json() as XAIResponse;

      // Extract text content from the response
      let fullText = '';
      if (json.output) {
        for (const block of json.output) {
          if (block.content) {
            if (typeof block.content === 'string') {
              fullText += block.content + '\n';
            } else if (Array.isArray(block.content)) {
              for (const part of block.content) {
                if (part.text) {
                  fullText += part.text + '\n';
                }
              }
            }
          }
        }
      }

      if (!fullText.trim()) {
        logWarn(`xAI returned empty text for query "${query}". Raw output types: ${json.output?.map(b => b.type).join(', ') || 'none'}`);
        return results;
      }

      // Strategy 1: Split into chunks starting with TWEET| (handles multi-line tweets)
      const tweetChunks = fullText.split(/(?=TWEET\|)/);
      let tweetIndex = 0;

      for (const chunk of tweetChunks) {
        const trimmed = chunk.trim();
        if (!trimmed.startsWith('TWEET|')) continue;

        // Collapse multi-line chunk into single line for parsing
        const singleLine = trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        const parts = singleLine.split('|');
        if (parts.length < 4) continue; // Need at least TWEET|user|text|num

        const authorUsername = (parts[1] || '').replace('@', '').trim();

        // Try to extract numeric stats from the end
        let text: string;
        let likes = 0, retweets = 0, replies = 0;

        // Walk backwards from end to find the 3 numeric fields
        const numericEnd: number[] = [];
        for (let i = parts.length - 1; i >= 2 && numericEnd.length < 3; i--) {
          const cleaned = parts[i].trim().replace(/,/g, '').replace(/[kK]$/, '000').replace(/[mM]$/, '000000');
          const num = parseInt(cleaned);
          if (!isNaN(num) && cleaned.length < 15) {
            numericEnd.unshift(num);
          } else {
            break;
          }
        }

        if (numericEnd.length === 3) {
          likes = numericEnd[0];
          retweets = numericEnd[1];
          replies = numericEnd[2];
          text = parts.slice(2, parts.length - 3).join('|').trim();
        } else if (numericEnd.length === 2) {
          likes = numericEnd[0];
          retweets = numericEnd[1];
          text = parts.slice(2, parts.length - 2).join('|').trim();
        } else {
          // No numeric stats found — just take everything as text
          text = parts.slice(2).join('|').trim();
        }

        if (!text || text.length < 10) continue;

        // Dedup by text content
        const textKey = text.slice(0, 100);
        if (this.seenTexts.has(textKey)) continue;
        this.seenTexts.add(textKey);

        // Extract any Solana addresses from the full chunk (use original multi-line text too)
        const extractedMints = extractMintAddresses(trimmed);

        tweetIndex++;
        results.push({
          id: `xai-${Date.now()}-${tweetIndex}`,
          text,
          authorUsername,
          createdAt: new Date().toISOString(),
          likes,
          retweets,
          replies,
          extractedMints,
        });
      }

      // Strategy 2: Also extract contract addresses from the ENTIRE response
      // (catches addresses mentioned anywhere, even outside TWEET| format)
      if (results.length === 0) {
        const allMints = extractMintAddresses(fullText);
        if (allMints.length > 0) {
          logInfo(`No formatted tweets parsed, but found ${allMints.length} contract addresses in raw response`);
          // Create synthetic entries for found mints
          for (const mint of allMints) {
            if (this.seenTexts.has(mint)) continue;
            this.seenTexts.add(mint);
            tweetIndex++;
            results.push({
              id: `xai-raw-${Date.now()}-${tweetIndex}`,
              text: `[Contract found in X search for "${query}"] ${mint}`,
              authorUsername: 'unknown',
              createdAt: new Date().toISOString(),
              likes: 0,
              retweets: 0,
              replies: 0,
              extractedMints: [mint],
            });
          }
        }
      }

      logInfo(`X search (xAI): found ${results.length} tweets with ${results.reduce((s, t) => s + t.extractedMints.length, 0)} mints (query: "${query}")`);
      if (results.length === 0 && fullText.length > 0) {
        logWarn(`xAI response preview (first 300 chars): ${fullText.slice(0, 300).replace(/\n/g, '\\n')}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logWarn(`xAI API timeout for query "${query}"`);
      } else {
        logWarn(`xAI API error: ${err.message || err}`);
      }
    }

    return results;
  }

  clearSeenCache(): void {
    this.seenTexts.clear();
  }
}
