import { Resend } from 'resend';
import { EmailSendResult } from '../types/index.js';
import config from './config.js';
import logger from './logger.js';

const resend = new Resend(config.resendApiKey);

/**
 * Sends an email using Resend API
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<EmailSendResult> {
  try {
    if (!config.resendApiKey) {
      throw new Error('Resend API key not configured');
    }

    logger.info(`Sending email to ${to}: ${subject}`);

    const { data, error } = await resend.emails.send({
      from: `${config.resend.fromName} <${config.resend.fromEmail}>`,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error('Resend API error:', error);
      return {
        messageId: `error_${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        error: error.message,
      };
    }

    logger.info(`Email sent successfully. Message ID: ${data?.id}`);

    return {
      messageId: data?.id || `msg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'SENT',
    };
  } catch (error: any) {
    logger.error('Error sending email:', error);
    
    return {
      messageId: `error_${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'FAILED',
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Sends a test email to verify configuration
 */
export async function sendTestEmail(to: string): Promise<EmailSendResult> {
  const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { color: #0066cc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Email from ReplyFan Campaign Bot</h1>
    <p>This is a test email to verify your Resend configuration.</p>
    <p>If you received this email, your email sending is working correctly!</p>
    <p><strong>Configuration:</strong></p>
    <ul>
      <li>From: ${config.resend.fromName} &lt;${config.resend.fromEmail}&gt;</li>
      <li>Bot Name: ${config.bot.name}</li>
    </ul>
  </div>
</body>
</html>
  `;

  return sendEmail(to, 'Test Email - ReplyFan Campaign Bot', testHtml);
}

/**
 * Validates email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Handles rate limiting by adding delay
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  delayMs: number = config.bot.emailSendDelayMs
): Promise<T> {
  const result = await fn();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return result;
}

