import { describe, expect, it } from 'vitest';
import { detectDialect, redactDatabaseUrl, sqliteFilePath } from '../src/db/dialect.js';

describe('detectDialect', () => {
  it.each([
    ['./data/mcserauth.db', 'sqlite'],
    ['sqlite:./data/mcserauth.db', 'sqlite'],
    ['file:./data/mcserauth.db', 'sqlite'],
    [':memory:', 'sqlite'],
    ['mysql://user:pass@localhost:3306/db', 'mysql'],
    ['mysql2://user:pass@localhost:3306/db', 'mysql'],
    ['postgres://user:pass@localhost:5432/db', 'postgres'],
    ['postgresql://user:pass@localhost:5432/db', 'postgres'],
  ] as const)('detects %s as %s', (url, expected) => {
    expect(detectDialect(url)).toBe(expected);
  });

  it('accepts a matching explicit override', () => {
    expect(detectDialect('mysql://localhost/db', 'mysql')).toBe('mysql');
    expect(detectDialect('./data/app.db', 'sqlite')).toBe('sqlite');
  });

  it('rejects an override that disagrees with the URL', () => {
    expect(() => detectDialect('postgres://localhost/db', 'mysql')).toThrow(/conflicts/);
  });

  it('rejects an unknown override', () => {
    expect(() => detectDialect('./data/app.db', 'oracle')).toThrow(/DB_DIALECT/);
  });

  it('rejects unsupported URL schemes', () => {
    expect(() => detectDialect('mongodb://localhost/db')).toThrow(/Unsupported DATABASE_URL/);
  });

  it('rejects an empty URL', () => {
    expect(() => detectDialect('   ')).toThrow(/must not be empty/);
  });
});

describe('sqliteFilePath', () => {
  it.each([
    ['./data/app.db', './data/app.db'],
    ['sqlite:./data/app.db', './data/app.db'],
    ['file:./data/app.db', './data/app.db'],
    [':memory:', ':memory:'],
    ['sqlite::memory:', ':memory:'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(sqliteFilePath(input)).toBe(expected);
  });

  it('normalizes absolute sqlite URLs', () => {
    expect(sqliteFilePath('sqlite:///tmp/app.db')).toBe('/tmp/app.db');
    expect(sqliteFilePath('file:///tmp/app.db')).toBe('/tmp/app.db');
  });
});

describe('redactDatabaseUrl', () => {
  it('hides the password', () => {
    expect(redactDatabaseUrl('mysql://user:secret@localhost/db')).toBe(
      'mysql://user:***@localhost/db',
    );
  });

  it('leaves SQLite paths untouched', () => {
    expect(redactDatabaseUrl('./data/app.db')).toBe('./data/app.db');
  });
});
