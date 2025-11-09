import { google, youtube_v3 } from 'googleapis';
import OpenAI from 'openai';
import { ResearchData, YouTubeChannelInfo } from '../types/index.js';
import config from './config.js';
import logger from './logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

// Simple in-memory cache with TTL
interface CacheEntry {
  data: ResearchData;
  expiresAt: number;
}

const researchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Extracts YouTube channel ID from various URL formats
 */
function extractChannelId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Handle @username format: https://youtube.com/@alexmotiv
    const usernameMatch = urlObj.pathname.match(/^\/@([^\/]+)/);
    if (usernameMatch) {
      return `@${usernameMatch[1]}`;
    }
    
    // Handle /channel/ format
    const channelMatch = urlObj.pathname.match(/\/channel\/([^\/]+)/);
    if (channelMatch) {
      return channelMatch[1];
    }
    
    // Handle /c/ or /user/ format
    const customMatch = urlObj.pathname.match(/\/(c|user)\/([^\/]+)/);
    if (customMatch) {
      return customMatch[2];
    }
    
    return null;
  } catch (error) {
    logger.error('Invalid YouTube URL:', url);
    return null;
  }
}

/**
 * Fetches channel information and recent videos from YouTube
 */
async function fetchYouTubeData(channelIdentifier: string): Promise<{
  channelInfo: YouTubeChannelInfo;
  videos: youtube_v3.Schema$SearchResult[];
}> {
  if (!config.youtubeApiKey) {
    throw new Error('YouTube API key not configured');
  }

  const youtube = google.youtube({
    version: 'v3',
    auth: config.youtubeApiKey,
  });

  try {
    // If it's a @username, we need to search for it first
    let channelId = channelIdentifier;
    let channelInfo: YouTubeChannelInfo;

    if (channelIdentifier.startsWith('@')) {
      const username = channelIdentifier.substring(1);
      
      // Search for the channel by username
      const searchResponse = await youtube.search.list({
        part: ['snippet'],
        q: username,
        type: ['channel'],
        maxResults: 1,
      });

      if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        throw new Error(`Channel ${channelIdentifier} not found`);
      }

      channelId = searchResponse.data.items[0].snippet?.channelId || '';
      channelInfo = {
        channelId,
        channelName: searchResponse.data.items[0].snippet?.title || username,
      };
    } else {
      // Get channel details
      const channelResponse = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [channelId],
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error(`Channel ${channelId} not found`);
      }

      const channel = channelResponse.data.items[0];
      channelInfo = {
        channelId: channel.id || '',
        channelName: channel.snippet?.title || '',
        subscriberCount: parseInt(channel.statistics?.subscriberCount || '0', 10),
      };
    }

    // Fetch recent videos
    const videosResponse = await youtube.search.list({
      part: ['snippet'],
      channelId: channelInfo.channelId,
      order: 'date',
      type: ['video'],
      maxResults: 5,
    });

    logger.info(`Fetched YouTube data for channel: ${channelInfo.channelName}`);
    
    return {
      channelInfo,
      videos: videosResponse.data.items || [],
    };
  } catch (error: any) {
    logger.error('YouTube API error:', error.message);
    
    // If quota exceeded or API error, return mock data
    if (error.code === 403 || error.code === 429) {
      logger.warn('YouTube API quota exceeded, using fallback');
      return {
        channelInfo: {
          channelId: channelIdentifier,
          channelName: 'YouTube Channel',
        },
        videos: [],
      };
    }
    
    throw error;
  }
}

/**
 * Generates a summary of the channel using GPT
 */
async function generateChannelSummary(
  channelName: string,
  niche: string,
  videoTitles: string[]
): Promise<string> {
  try {
    const prompt = `You are an AI assistant helping with email outreach to YouTube creators.

Given the following information about a YouTube channel, write a brief 2-3 sentence summary that can be used for personalization context in an email:

Channel Name: ${channelName}
Niche: ${niche}
Recent Video Titles: ${videoTitles.join(', ') || 'No recent videos available'}

Write a natural, concise summary that highlights what makes this channel unique and relevant. Keep it under 80 words.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    const summary = response.choices[0].message.content?.trim() || '';
    logger.debug(`Generated channel summary: ${summary.substring(0, 50)}...`);
    
    return summary;
  } catch (error) {
    logger.error('Error generating channel summary:', error);
    return `${channelName} is a ${niche} YouTube channel creating engaging content for their audience.`;
  }
}

/**
 * Main function to get research data for a YouTube channel
 */
export async function getResearch(youtubeUrl: string, niche: string): Promise<ResearchData> {
  // Check cache first
  const cached = researchCache.get(youtubeUrl);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug(`Using cached research data for: ${youtubeUrl}`);
    return cached.data;
  }

  try {
    const channelIdentifier = extractChannelId(youtubeUrl);
    
    if (!channelIdentifier) {
      throw new Error('Invalid YouTube URL');
    }

    // Fetch YouTube data
    const { channelInfo, videos } = await fetchYouTubeData(channelIdentifier);
    
    // Extract video titles
    const videoTitles = videos
      .map((video) => video.snippet?.title || '')
      .filter((title) => title.length > 0);

    // Generate summary
    const summary = await generateChannelSummary(
      channelInfo.channelName,
      niche,
      videoTitles
    );

    const researchData: ResearchData = {
      summary,
      recentVideos: videoTitles,
      channelName: channelInfo.channelName,
      channelId: channelInfo.channelId,
    };

    // Cache the result
    researchCache.set(youtubeUrl, {
      data: researchData,
      expiresAt: Date.now() + CACHE_TTL,
    });

    logger.info(`Research completed for: ${channelInfo.channelName}`);
    return researchData;
  } catch (error: any) {
    logger.error(`Failed to research channel ${youtubeUrl}:`, error.message);
    
    // Return minimal fallback data
    return {
      summary: `A ${niche} YouTube channel creating content for their audience.`,
      recentVideos: [],
      channelName: 'YouTube Creator',
    };
  }
}

/**
 * Clears the research cache
 */
export function clearCache(): void {
  researchCache.clear();
  logger.info('Research cache cleared');
}

