import { readFile } from 'fs/promises';
import { join } from 'path';
import config from '../lib/config.js';
import { ContactRow, GptInstruction } from '../types/index.js';
import logger from '../lib/logger.js';

/**
 * Loads a template file from the templates directory
 * @param templateName - Name of template (e.g., "email_1")
 * @returns Template content as string
 */
export async function loadTemplate(templateName: string): Promise<string> {
  const templatePath = join(config.paths.templates, `${templateName}.txt`);
  
  try {
    const content = await readFile(templatePath, 'utf-8');
    logger.debug(`Loaded template: ${templateName}`);
    return content;
  } catch (error) {
    logger.error(`Failed to load template ${templateName}:`, error);
    throw new Error(`Template ${templateName} not found`);
  }
}

/**
 * Replaces [COLUMN_NAME] placeholders with actual values from row data
 * @param template - Template string
 * @param row - Contact row data
 * @returns Template with static placeholders replaced
 */
export function replaceStaticPlaceholders(template: string, row: ContactRow): string {
  let result = template;
  
  // Replace [NAME]
  result = result.replace(/\[NAME\]/g, row.Name || '');
  
  // Replace [NICHE]
  result = result.replace(/\[NICHE\]/g, row.Niche || '');
  
  // Replace [WEBSITE]
  result = result.replace(/\[WEBSITE\]/g, row.Website || '');
  
  // Replace [YT_LINK]
  result = result.replace(/\[YT_LINK\]/g, row['YT Link'] || '');
  
  // Replace [YT_FOLLOWERS]
  result = result.replace(/\[YT_FOLLOWERS\]/g, String(row['YT Followers'] || ''));
  
  // Replace any other [COLUMN] patterns with row data if available
  const placeholderRegex = /\[([A-Z_]+)\]/g;
  result = result.replace(placeholderRegex, (match, columnName) => {
    // Try direct match
    if (row[columnName] !== undefined) {
      return String(row[columnName]);
    }
    
    // Try with spaces (e.g., YT_LINK -> "YT Link")
    const columnWithSpaces = columnName.replace(/_/g, ' ');
    if (row[columnWithSpaces] !== undefined) {
      return String(row[columnWithSpaces]);
    }
    
    // If not found, leave as is
    logger.warn(`Placeholder ${match} not found in row data`);
    return match;
  });
  
  return result;
}

/**
 * Extracts all {{GPT instruction}} placeholders from a template
 * @param template - Template string
 * @returns Array of GPT instructions with their positions
 */
export function extractGptInstructions(template: string): GptInstruction[] {
  const instructions: GptInstruction[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    instructions.push({
      placeholder: match[0],
      instruction: match[1].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  logger.debug(`Extracted ${instructions.length} GPT instructions from template`);
  return instructions;
}

/**
 * Replaces GPT placeholders with generated content
 * @param template - Template string with GPT placeholders
 * @param replacements - Map of placeholder to replacement text
 * @returns Template with GPT placeholders replaced
 */
export function replaceGptPlaceholders(
  template: string,
  replacements: Map<string, string>
): string {
  let result = template;
  
  for (const [placeholder, replacement] of replacements.entries()) {
    result = result.replace(placeholder, replacement);
  }
  
  return result;
}

/**
 * Extracts subject line from template
 * Subject line should be on first line starting with "Subject:"
 * @param template - Complete template string
 * @returns Object with subject and body separated
 */
export function parseEmailTemplate(template: string): {
  subject: string;
  body: string;
} {
  const lines = template.split('\n');
  let subject = '';
  let bodyStartIndex = 0;
  
  // Check if first line is subject
  if (lines[0] && lines[0].trim().startsWith('Subject:')) {
    subject = lines[0].replace(/^Subject:\s*/i, '').trim();
    bodyStartIndex = 1;
  }
  
  // Skip empty lines after subject
  while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === '') {
    bodyStartIndex++;
  }
  
  const body = lines.slice(bodyStartIndex).join('\n').trim();
  
  return { subject, body };
}

/**
 * Converts plain text email body to simple HTML
 * @param text - Plain text email body
 * @returns HTML formatted email
 */
export function textToHtml(text: string): string {
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  const htmlParagraphs = paragraphs.map((p) => {
    // Replace single newlines with <br>
    const withBreaks = p.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin: 15px 0; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${htmlParagraphs.join('\n  ')}
</body>
</html>
  `.trim();
}

