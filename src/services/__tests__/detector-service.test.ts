import { DetectorService } from '../detector-service';

describe('DetectorService', () => {
  let detector: DetectorService;

  beforeEach(() => {
    detector = new DetectorService();
  });

  describe('API Key Detection', () => {
    it('should detect Stripe sk_live keys', () => {
      const text = 'my key is 'sk_live_' + 'test1234567890abcdefghijkl'';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.types.some(t => t.type === 'API Key')).toBe(true);
    });

    it('should detect multiple API keys', () => {
      const text = ''sk_live_' + 'test1234567890abcdefghijkl' and 'sk_test_' + 'example1234567890example'';
      const result = detector.detect(text);
      expect(result.count).toBeGreaterThanOrEqual(2);
    });

    it('should detect GitHub tokens', () => {
      const text = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('should not match partial API key patterns', () => {
      const text = 'sk_live_ (incomplete)';
      const result = detector.detect(text);
      expect(result.found).toBe(false);
    });
  });

  describe('AWS Detection', () => {
    it('should detect AKIA keys', () => {
      const text = 'AWS key: AKIA1234567890ABCDEF';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.types.some(t => t.type === 'AWS Credentials')).toBe(true);
    });

    it('should detect aws_access_key_id pattern', () => {
      const text = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });

    it('should handle case insensitivity', () => {
      const text = 'AWS_ACCESS_KEY_ID=ABC123';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });
  });

  describe('Private Key Detection', () => {
    it('should detect RSA private keys', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2Z3qX2BTLS...
-----END RSA PRIVATE KEY-----`;
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('should detect OpenSSH private keys', () => {
      const text = '-----BEGIN OPENSSH PRIVATE KEY-----\nkey_content_here';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });

    it('should detect PGP private keys', () => {
      const text = '-----BEGIN PGP PRIVATE KEY BLOCK-----\nversion: GnuPG';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });

    it('should detect multiple private keys', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----\nkey1
-----BEGIN EC PRIVATE KEY-----\nkey2`;
      const result = detector.detect(text);
      expect(result.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Credit Card Detection', () => {
    it('should detect credit card numbers', () => {
      const text = 'card: 4111-1111-1111-1111';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toMatch(/high|critical/);
    });

    it('should detect various card formats', () => {
      const formats = [
        '4111 1111 1111 1111',
        '4111-1111-1111-1111',
        '5555555555554444',
      ];
      formats.forEach(card => {
        const result = detector.detect(card);
        expect(result.found).toBe(true);
      });
    });
  });

  describe('SSN Detection', () => {
    it('should detect valid social security numbers', () => {
      const text = 'SSN: 123-45-6789';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toMatch(/high|critical/);
    });

    it('should reject invalid SSNs', () => {
      const invalid = [
        '000-00-0000', // All zeros
        '666-00-0000', // 666 area code
        '123-00-0000', // Zero group
        '123-45-0000', // Zero serial
      ];
      invalid.forEach(ssn => {
        const result = detector.detect(ssn);
        // May not detect as SSN due to validation rules
        if (result.found) {
          expect(result.types.some(t => t.type === 'Social Security Number')).toBe(false);
        }
      });
    });
  });

  describe('Database Credentials', () => {
    it('should detect MongoDB connection strings', () => {
      const text = 'mongodb+srv://user:pass@cluster.mongodb.net/db';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toMatch(/high|critical/);
    });

    it('should detect PostgreSQL connection strings', () => {
      const text = 'postgres://user:password@localhost:5432/mydb';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });

    it('should detect password= patterns', () => {
      const text = 'config: password=MySecurePass123';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });
  });

  describe('Bearer Tokens', () => {
    it('should detect bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
      expect(result.severity).toBe('critical');
    });

    it('should handle various token formats', () => {
      const text = 'Bearer dGhpc2lzYXRlc3R0b2tlbg==';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });
  });

  describe('Severity Calculation', () => {
    it('should mark as safe when no findings', () => {
      const result = detector.detect('just normal text');
      expect(result.severity).toBe('safe');
      expect(result.found).toBe(false);
    });

    it('should mark as critical for API keys', () => {
      const result = detector.detect(''sk_live_' + 'test1234567890abcdefghijkl'');
      expect(result.severity).toBe('critical');
    });

    it('should mark as high for credit cards', () => {
      const result = detector.detect('4111-1111-1111-1111');
      expect(result.severity).toBe('high');
    });

    it('should prioritize critical over high', () => {
      const text = ''sk_live_' + 'test1234567890abcdefghijkl' and 4111-1111-1111-1111';
      const result = detector.detect(text);
      expect(result.severity).toBe('critical');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null input gracefully', () => {
      const result = detector.detect(null as any);
      expect(result.found).toBe(false);
      expect(result.severity).toBe('safe');
    });

    it('should handle undefined input', () => {
      const result = detector.detect(undefined as any);
      expect(result.found).toBe(false);
    });

    it('should handle empty strings', () => {
      const result = detector.detect('');
      expect(result.found).toBe(false);
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(100000) + ''sk_live_' + 'test1234567890abcdefghijkl'';
      const result = detector.detect(longText);
      expect(result.found).toBe(true);
    });

    it('should handle Unicode characters', () => {
      const text = '你好 'sk_live_' + 'test1234567890abcdefghijkl' مرحبا';
      const result = detector.detect(text);
      expect(result.found).toBe(true);
    });

    it('should return correct result structure', () => {
      const result = detector.detect(''sk_live_' + 'test1234567890abcdefghijkl'');
      expect(result).toHaveProperty('found');
      expect(result).toHaveProperty('types');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('severity');
      expect(Array.isArray(result.types)).toBe(true);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should detect secrets in .env files', () => {
      const envContent = `
DATABASE_URL=postgres://user:password@localhost:5432/db
API_KEY='sk_live_' + 'test1234567890abcdefghijkl'
AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
`;
      const result = detector.detect(envContent);
      expect(result.found).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(3);
    });

    it('should detect secrets in config files', () => {
      const config = `
{
  "apiKey": "'sk_live_' + 'example1234567890example1'",
  "dbPassword": "MySecurePass",
  "awsKey": "AKIAIOSFODNN7EXAMPLE"
}
`;
      const result = detector.detect(config);
      expect(result.found).toBe(true);
    });

    it('should detect multiple types in code snippet', () => {
      const code = `
fetch('https://api.example.com', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOi...',
    'X-API-Key': ''sk_live_' + 'test1234567890abcdefghijkl''
  }
});
`;
      const result = detector.detect(code);
      expect(result.found).toBe(true);
      expect(result.severity).toBe('critical');
    });
  });
});
