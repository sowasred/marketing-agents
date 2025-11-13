import OpenAI from 'openai';
import { ContactRow, ResearchData, PersonalizedEmail, TemplateContext } from '../types/index.js';
import {
  loadTemplate,
  replaceStaticPlaceholders,
  extractGptInstructions,
  replaceGptPlaceholders,
  parseEmailTemplate,
  textToHtml,
} from '../utils/templateRenderer.js';
import config from './config.js';
import logger from './logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Generates content for a single GPT instruction
 */
async function generateGptContent(
  instruction: string,
  context: TemplateContext
): Promise<string> {
  try {
    const prompt = `You are an AI assistant helping to personalize email outreach to YouTube creators.

Context about the creator:
- Name: ${context.name}
- Niche: ${context.niche}
- Channel Summary: ${context.research.summary}
- Recent Videos: ${context.research.recentVideos.join(', ') || 'No recent videos available'}

Task: ${instruction}

Write natural, conversational text that sounds personal and genuine. Keep it concise (under 50 words unless the instruction specifically asks for more). Do not use overly salesy language.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.8,
    });

    const content = response.choices[0].message.content?.trim() || '';
    logger.debug(`Generated GPT content for instruction: ${instruction.substring(0, 30)}...`);

    return content;
  } catch (error) {
    logger.error('Error generating GPT content:', error);
    return '[Content generation failed]';
  }
}

/**
 * Personalizes an email template with both static and GPT-generated content
 */
export async function personalize(
  templateName: string,
  row: ContactRow,
  research: ResearchData
): Promise<PersonalizedEmail> {
  try {
    logger.info(`Personalizing template ${templateName} for ${row.name}`);

    // Load template
    let template = await loadTemplate(templateName);

    // Replace static placeholders [COLUMN_NAME]
    template = replaceStaticPlaceholders(template, row);

    // Extract GPT instructions {{...}}
    const gptInstructions = extractGptInstructions(template);

    // Create context for GPT
    const context: TemplateContext = {
      name: row.name,
      niche: row.niche,
      website: row.website,
      ytFollowers: row.yt_followers,
      research,
    };

    // Generate content for each GPT instruction
    const replacements = new Map<string, string>();

    for (const instruction of gptInstructions) {
      const content = await generateGptContent(instruction.instruction, context);
      replacements.set(instruction.placeholder, content);

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Replace GPT placeholders
    template = replaceGptPlaceholders(template, replacements);

    // Parse subject and body
    const { subject, body } = parseEmailTemplate(template);

    // Convert to HTML
    const html = textToHtml(body);

    logger.info(`Successfully personalized email for ${row.name}`);

    return {
      subject: subject || `Following up - ${row.name}`,
      html,
      templateName,
    };
  } catch (error) {
    logger.error(`Error personalizing template for ${row.name}:`, error);
    throw error;
  }
}

/**
 * Batch personalizes multiple emails (useful for pre-generation)
 */
export async function batchPersonalize(
  templateName: string,
  rows: ContactRow[],
  researchMap: Map<string, ResearchData>
): Promise<Map<number, PersonalizedEmail>> {
  const results = new Map<number, PersonalizedEmail>();

  for (const row of rows) {
    try {
      const research = researchMap.get(row.yt_link);

      if (!research) {
        logger.warn(`No research data for ${row.name}, skipping`);
        continue;
      }

      const personalized = await personalize(templateName, row, research);
      results.set(row._rowNumber, personalized);

      // Delay between generations to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, config.bot.emailSendDelayMs));
    } catch (error) {
      logger.error(`Failed to personalize for row ${row._rowNumber}:`, error);
    }
  }

  logger.info(`Batch personalized ${results.size} emails out of ${rows.length} rows`);
  return results;
}

