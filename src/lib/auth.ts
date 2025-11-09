import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from './config.js';
import logger from './logger.js';

/**
 * API Key Authentication Middleware
 * Protects campaign endpoints from unauthorized access
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!config.apiKey) {
    logger.warn('API_KEY not configured - authentication disabled');
    return next();
  }
  
  if (!apiKey) {
    logger.warn('API request without API key', { path: req.path, ip: req.ip });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Include X-API-Key header.',
    });
    return;
  }
  
  if (apiKey !== config.apiKey) {
    logger.warn('API request with invalid key', { path: req.path, ip: req.ip });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
    return;
  }
  
  logger.debug('API key validated successfully');
  next();
}

/**
 * Webhook Signature Verification for Resend
 * Ensures webhooks are actually from Resend
 */
export function verifyResendWebhook(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['resend-signature'] as string;
  const webhookSecret = config.webhookSecret;
  
  if (!webhookSecret) {
    logger.warn('WEBHOOK_SECRET not configured - webhook verification disabled');
    return next();
  }
  
  if (!signature) {
    logger.warn('Webhook received without signature', { ip: req.ip });
    res.status(401).json({ error: 'Missing signature' });
    return;
  }
  
  try {
    // Resend uses HMAC-SHA256 for webhook signatures
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      logger.warn('Invalid webhook signature', { ip: req.ip });
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }
    
    logger.debug('Webhook signature verified');
    next();
  } catch (error) {
    logger.error('Error verifying webhook signature:', error);
    res.status(500).json({ error: 'Signature verification failed' });
  }
}

/**
 * Optional Bearer Token Authentication
 * More standard than API key for some use cases
 */
export function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!config.apiKey) {
    logger.warn('API_KEY not configured - authentication disabled');
    return next();
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer token required',
    });
    return;
  }
  
  const token = authHeader.substring(7);
  
  if (token !== config.apiKey) {
    logger.warn('Invalid bearer token', { path: req.path, ip: req.ip });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid token',
    });
    return;
  }
  
  next();
}

/**
 * IP Whitelist Middleware (optional)
 * Only allow requests from specific IPs
 */
export function requireWhitelistedIp(req: Request, res: Response, next: NextFunction): void {
  const allowedIps = config.allowedIps || [];
  
  if (allowedIps.length === 0) {
    return next(); // No whitelist configured
  }
  
  const clientIp = req.ip || req.connection.remoteAddress || '';
  
  if (!allowedIps.includes(clientIp)) {
    logger.warn('Request from non-whitelisted IP', { ip: clientIp, path: req.path });
    res.status(403).json({
      error: 'Forbidden',
      message: 'IP address not whitelisted',
    });
    return;
  }
  
  next();
}

/**
 * Request ID Generator
 * Adds unique ID to each request for tracking
 */
export function addRequestId(req: Request, _res: Response, next: NextFunction): void {
  req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
  next();
}

