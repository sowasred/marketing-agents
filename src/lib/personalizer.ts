import OpenAI from 'openai';
import { ContactRow, ResearchData, PersonalizedEmail, TemplateContext } from '../types/index.js';
import {
  loadTemplate,
  replaceStaticPlaceholders,
  extractGptInstructions,
  parseEmailTemplate,
  textToHtml,
} from '../utils/templateRenderer.js';
import config from './config.js';
import logger from './logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Generates the complete email content by replacing all GPT instruction placeholders in a single call
 */
async function generateCompleteEmail(
  template: string,
  context: TemplateContext
): Promise<string> {
  try {
    // Check if there are any GPT instructions in the template
    const gptInstructions = extractGptInstructions(template);

    // If no GPT instructions, return template as-is
    if (gptInstructions.length === 0) {
      logger.debug('No GPT instructions found in template, returning as-is');
      return template;
    }

    const prompt = `You are an AI assistant helping to personalize email outreach to YouTube creators.

Context about the creator:
- Name: ${context.name}
- Niche: ${context.niche}
- Channel Summary: ${context.research.summary}
- Recent Videos: ${context.research.recentVideos.join(', ') || 'No recent videos available'}

Below is an email template with placeholders in the format {{instruction}}. Your task is to replace ALL of these placeholders with personalized, natural, conversational text that sounds personal and genuine.

Template:
${template}

Instructions:
- Replace each {{instruction}} placeholder with content that matches the instruction
- Keep the content concise and natural (typically under 50 words per placeholder unless the instruction asks for more)
- Do not use overly salesy language
- Maintain the exact structure and formatting of the template
- Return the complete email with all placeholders replaced, including the subject line if present

Return the complete email exactly as shown in the template, but with all {{instruction}} placeholders replaced with personalized content.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.8,
    });

    const content = response.choices[0].message.content?.trim() || '';
    logger.debug(`Generated complete email content for ${context.name}`);

    return content;
  } catch (error) {
    logger.error('Error generating complete email content:', error);
    throw error;
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

    // Create context for GPT
    const context: TemplateContext = {
      name: row.name,
      niche: row.niche,
      website: row.website,
      ytFollowers: row.yt_followers,
      research,
    };

    // Generate complete email content in a single GPT call
    template = await generateCompleteEmail(template, context);

    // Parse subject and body
    const { subject, body } = parseEmailTemplate(template);

    // Convert to HTML
    const html = textToHtml(body);

    logger.info(`Successfully personalized email for ${row.name}`);

    return {
      subject: subject,
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

