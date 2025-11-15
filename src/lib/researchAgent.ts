import { google, youtube_v3 } from 'googleapis';
import OpenAI from 'openai';
import { ResearchData, YouTubeChannelInfo } from '../types/index.js';
import config from './config.js';
import logger from './logger.js';

// Maximum content length to send to GPT (to avoid token limits)
const MAX_WEBSITE_CONTENT_LENGTH = 5000;

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
    logger.warn('YouTube API quota exceeded, using fallback');
    return {
      channelInfo: {
        channelId: channelIdentifier,
        channelName: 'YouTube Channel',
      },
      videos: [],
    };
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
  // TODO: When there is no videos, do website research if website is available. and do not throw error if that also fails, still make the chatgpt call with empty research data.
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
 * Fetches website content and extracts text from HTML
 */
async function fetchWebsiteContent(websiteUrl: string): Promise<string> {
  // Ensure URL has protocol
  let url = websiteUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  logger.info(`Fetching website content from: ${url}`);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // Extract text content from HTML
    // Remove script and style tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // Extract title
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    const metaDescMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : '';

    // Extract text from body
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyText = bodyMatch ? bodyMatch[1] : text;

    // Remove HTML tags and decode entities
    bodyText = bodyText
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Combine title, description, and body text
    let content = '';
    if (title) content += `Title: ${title}\n\n`;
    if (metaDescription) content += `Description: ${metaDescription}\n\n`;
    if (bodyText) content += bodyText;

    // Limit content length
    if (content.length > MAX_WEBSITE_CONTENT_LENGTH) {
      content = content.substring(0, MAX_WEBSITE_CONTENT_LENGTH) + '...';
    }

    logger.debug(`Extracted ${content.length} characters from website`);
    return content;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout: website did not respond within 10 seconds');
    }
    logger.error(`Error fetching website content from ${websiteUrl}:`, error.message);
    throw error;
  }
}

/**
 * Generates a summary of the website using GPT
 */
async function generateWebsiteSummary(
  websiteUrl: string,
  websiteContent: string,
  niche: string
): Promise<string> {
  try {
    const prompt = `You are an AI assistant helping with email outreach to content creators.

Given the following information about a website, write a brief 2-3 sentence summary that can be used for personalization context in an email:

Website URL: ${websiteUrl}
Niche: ${niche}
Website Content:
${websiteContent}

Write a natural, concise summary that highlights what makes this website/creator unique and relevant. Keep it under 80 words. Focus on the main purpose, content type, and what makes them stand out.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    const summary = response.choices[0].message.content?.trim() || '';
    logger.debug(`Generated website summary: ${summary.substring(0, 50)}...`);

    return summary;
  } catch (error) {
    logger.error('Error generating website summary:', error);
    return `A ${niche} website creating content for their audience.`;
  }
}

/**
 * Gets research data for a website
 */
export async function getWebsiteResearch(websiteUrl: string, niche: string): Promise<ResearchData> {
  // Check cache first (use 'website:' prefix to distinguish from YouTube URLs)
  const cacheKey = `website:${websiteUrl}`;
  const cached = researchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug(`Using cached website research data for: ${websiteUrl}`);
    return cached.data;
  }

  try {
    // Fetch website content
    const websiteContent = await fetchWebsiteContent(websiteUrl);

    // Generate summary
    const summary = await generateWebsiteSummary(websiteUrl, websiteContent, niche);

    // Extract domain name for channelName
    let channelName = 'Website Creator';
    try {
      const urlObj = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
      channelName = urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      // Use websiteUrl as fallback
      channelName = websiteUrl;
    }

    const researchData: ResearchData = {
      summary,
      recentVideos: [], // Websites don't have videos
      channelName,
    };

    // Cache the result
    researchCache.set(cacheKey, {
      data: researchData,
      expiresAt: Date.now() + CACHE_TTL,
    });

    logger.info(`Website research completed for: ${channelName}`);
    return researchData;
  } catch (error: any) {
    logger.error(`Failed to research website ${websiteUrl}:`, error.message);

    // Return minimal fallback data
    return {
      summary: `A ${niche} website creating content for their audience.`,
      recentVideos: [],
      channelName: 'Website Creator',
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

