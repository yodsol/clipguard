import { DetectionResult, DetectionFinding } from '../types';

interface PatternConfig {
  name: string;
  patterns: RegExp[];
}

export class DetectorService {
  private patterns: Map<string, PatternConfig> = new Map([
    [
      'api_keys',
      {
        name: 'API Key',
        patterns: [
          /sk_live_[a-zA-Z0-9]{24}/g,
          /sk_test_[a-zA-Z0-9]{24}/g,
          /pk_live_[a-zA-Z0-9]{24}/g,
          /rk_live_[a-zA-Z0-9]{24}/g,
          /ghp_[a-zA-Z0-9]{36}/g,
          /gho_[a-zA-Z0-9]{36}/g,
          /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
        ],
      },
    ],
    [
      'aws_keys',
      {
        name: 'AWS Credentials',
        patterns: [
          /AKIA[0-9A-Z]{16}/g,
          /aws_access_key_id\s*=\s*[^\s]+/gi,
          /aws_secret_access_key\s*=\s*[^\s]+/gi,
        ],
      },
    ],
    [
      'private_keys',
      {
        name: 'Private Key',
        patterns: [
          /-----BEGIN RSA PRIVATE KEY-----/g,
          /-----BEGIN OPENSSH PRIVATE KEY-----/g,
          /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
          /-----BEGIN EC PRIVATE KEY-----/g,
        ],
      },
    ],
    [
      'database',
      {
        name: 'Database Credentials',
        patterns: [
          /mongodb\+srv:\/\/[^\s]+@[^\s]+/gi,
          /postgres:\/\/[^\s]+:[^\s]+@[^\s]+/gi,
          /mysql:\/\/[^\s]+:[^\s]+@[^\s]+/gi,
          /password\s*=\s*[^\s]+/gi,
        ],
      },
    ],
    [
      'credit_card',
      {
        name: 'Credit Card Number',
        patterns: [
          /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
          /\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b/g,
        ],
      },
    ],
    [
      'ssn',
      {
        name: 'Social Security Number',
        patterns: [/\b(?!000|666)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g],
      },
    ],
    [
      'bearer_token',
      {
        name: 'Bearer Token',
        patterns: [/bearer\s+[a-zA-Z0-9._\-~+\/]+=*/gi],
      },
    ],
    [
      'generic_secrets',
      {
        name: 'Secret/Password',
        patterns: [
          /secret\s*[:=]\s*[^\s]+/gi,
          /password\s*[:=]\s*[^\s]+/gi,
          /token\s*[:=]\s*[^\s]+/gi,
          /api_key\s*[:=]\s*[^\s]+/gi,
        ],
      },
    ],
  ]);

  detect(text: string): DetectionResult {
    if (!text || typeof text !== 'string') {
      return { found: false, types: [], count: 0, severity: 'safe' };
    }

    const findings: DetectionFinding[] = [];
    let totalMatches = 0;

    for (const [category, config] of this.patterns) {
      let categoryMatches = 0;

      for (const pattern of config.patterns) {
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches) {
          categoryMatches += matches.length;
        }
      }

      if (categoryMatches > 0) {
        findings.push({
          type: config.name,
          category,
          count: categoryMatches,
        });
        totalMatches += categoryMatches;
      }
    }

    return {
      found: findings.length > 0,
      types: findings,
      count: totalMatches,
      severity: this.calculateSeverity(findings),
    };
  }

  private calculateSeverity(findings: DetectionFinding[]): 'safe' | 'medium' | 'high' | 'critical' {
    if (findings.length === 0) return 'safe';

    const criticalTypes = ['API Key', 'AWS Credentials', 'Private Key', 'Bearer Token'];
    const highRiskTypes = ['Database Credentials', 'Social Security Number', 'Credit Card Number'];

    const hasCritical = findings.some(f => criticalTypes.includes(f.type));
    const hasHighRisk = findings.some(f => highRiskTypes.includes(f.type));

    if (hasCritical) return 'critical';
    if (hasHighRisk) return 'high';
    return 'medium';
  }
}

export const detector = new DetectorService();
