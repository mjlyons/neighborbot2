import type { WAMessage } from '@whiskeysockets/baileys';
import { describe, expect, it } from 'vitest';

import {
  extractTextBody,
  extractVCards,
  isRevokedMessage,
  isStubMessage,
} from './DownloadMessages.js';

const makeMsg = (overrides: Partial<NonNullable<WAMessage['message']>> = {}): WAMessage => ({
  key: { id: 'test-id', remoteJid: '123@g.us' },
  message: overrides as WAMessage['message'],
  messageTimestamp: 1700000000n,
});

describe('extractTextBody', () => {
  it('returns conversation text', () => {
    expect(extractTextBody(makeMsg({ conversation: 'hello' }))).toBe('hello');
  });

  it('returns extendedTextMessage text', () => {
    expect(extractTextBody(makeMsg({ extendedTextMessage: { text: 'hi' } }))).toBe('hi');
  });

  it('returns empty string when no text', () => {
    expect(extractTextBody(makeMsg())).toBe('');
  });
});

describe('extractVCards', () => {
  it('returns single contactMessage vcard', () => {
    expect(extractVCards(makeMsg({ contactMessage: { vcard: 'BEGIN:VCARD' } }))).toEqual([
      'BEGIN:VCARD',
    ]);
  });

  it('returns multiple vcards from contactsArrayMessage', () => {
    const result = extractVCards(
      makeMsg({
        contactsArrayMessage: {
          contacts: [{ vcard: 'VCARD1' }, { vcard: 'VCARD2' }],
        },
      })
    );
    expect(result).toEqual(['VCARD1', 'VCARD2']);
  });

  it('returns empty array when no contacts', () => {
    expect(extractVCards(makeMsg())).toEqual([]);
  });
});

describe('isStubMessage', () => {
  it('returns true when message field is absent and messageStubType is set', () => {
    expect(isStubMessage({ key: { id: 'x' }, messageStubType: 1 } as WAMessage)).toBe(true);
  });

  it('returns false for normal messages', () => {
    expect(isStubMessage(makeMsg({ conversation: 'hi' }))).toBe(false);
  });
});

describe('isRevokedMessage', () => {
  it('returns true for REVOKE protocol message (type 0)', () => {
    expect(isRevokedMessage(makeMsg({ protocolMessage: { type: 0 } }))).toBe(true);
  });

  it('returns false for normal message', () => {
    expect(isRevokedMessage(makeMsg({ conversation: 'hi' }))).toBe(false);
  });
});
