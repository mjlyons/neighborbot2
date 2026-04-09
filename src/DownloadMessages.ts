import { getContentType, type WAMessage } from '@whiskeysockets/baileys';

import type { WhatsappContact } from './Services/Whatsapp/Whatsapp.d.ts';

export type ChatMessageV1 = {
  id: string;
  body: ChatBodyTextV1 | ChatVCardsV1 | ChatBodyDeletedV1;
  timestamp: number;
  contact: ChatContactV1 | null;
  quotedMessage: ChatMessageV1 | null;
  hasMedia: boolean;
  wawMessageType: string;
};

export type ChatContactV1 = {
  id: string;
  pushname: string;
  phoneNumber: string;
};

export type ChatBodyTextV1 = { text: string };
export type ChatVCardsV1 = { vCards: string[] };
export type ChatBodyDeletedV1 = { isDeleted: true };

export const extractTextBody = (msg: WAMessage): string =>
  msg.message?.conversation ??
  msg.message?.extendedTextMessage?.text ??
  msg.message?.imageMessage?.caption ??
  msg.message?.videoMessage?.caption ??
  '';

export const extractVCards = (msg: WAMessage): string[] => {
  const single = msg.message?.contactMessage?.vcard;
  if (single) return [single];
  const multi = msg.message?.contactsArrayMessage?.contacts;
  if (multi) return multi.map((c) => c.vcard ?? '').filter(Boolean);
  return [];
};

export const isStubMessage = (msg: WAMessage): boolean =>
  !msg.message && msg.messageStubType != null;

// proto.Message.ProtocolMessage.Type.REVOKE === 0
export const isRevokedMessage = (msg: WAMessage): boolean =>
  msg.message?.protocolMessage?.type === 0;

const serializeContact = (contact: WhatsappContact): ChatContactV1 => ({
  id: contact.id,
  pushname: contact.pushname,
  phoneNumber: contact.phoneNumber,
});

const serializeMessage = (
  wawMsg: WAMessage,
  getContact: (jid: string) => WhatsappContact | null
): ChatMessageV1 | null => {
  if (isStubMessage(wawMsg)) return null;

  const quotedRaw = wawMsg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedMessage = quotedRaw
    ? serializeMessage({ key: { id: 'quoted' }, message: quotedRaw }, getContact)
    : null;

  const authorJid = wawMsg.participant ?? wawMsg.key.remoteJid ?? '';
  const contactRaw = authorJid ? getContact(authorJid) : null;
  const contact = contactRaw ? serializeContact(contactRaw) : null;

  const vCards = extractVCards(wawMsg);
  const msgType = wawMsg.message ? (getContentType(wawMsg.message) ?? 'unknown') : 'stub';
  const hasMedia = !!(
    wawMsg.message?.imageMessage ||
    wawMsg.message?.videoMessage ||
    wawMsg.message?.audioMessage ||
    wawMsg.message?.documentMessage
  );

  return {
    id: wawMsg.key.id ?? '',
    body: isRevokedMessage(wawMsg)
      ? { isDeleted: true }
      : vCards.length > 0
        ? { vCards }
        : { text: extractTextBody(wawMsg) },
    timestamp: Number(wawMsg.messageTimestamp),
    contact,
    hasMedia,
    quotedMessage,
    wawMessageType: msgType,
  };
};

export const fetchMessages = (
  messages: WAMessage[],
  getContact: (jid: string) => WhatsappContact | null
): ChatMessageV1[] =>
  messages
    .map((msg) => serializeMessage(msg, getContact))
    .filter((msg): msg is ChatMessageV1 => msg !== null);

export const loadMessagesFromFile = async (filename: string): Promise<ChatMessageV1[]> => {
  const fs = await import('fs/promises');
  const fileContent = await fs.readFile(filename, 'utf-8');
  const { serializedMessages } = JSON.parse(fileContent) as { serializedMessages: ChatMessageV1[] };
  return serializedMessages;
};
