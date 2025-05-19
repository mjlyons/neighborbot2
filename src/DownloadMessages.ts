import { type Chat, type Contact, type Message } from 'whatsapp-web.js';

const MESSAGE_RECHECK_SECONDS = 10;
const MESSAGE_MAX_RETRY_COUNT = 2;

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

export type ChatBodyTextV1 = {
  text: string;
};

export type ChatVCardsV1 = {
  vCards: string[];
};

export type ChatBodyDeletedV1 = { isDeleted: true };

const downloadAllMessages = async (chat: Chat): Promise<Message[]> => {
  let messages = await chat.fetchMessages({ limit: Infinity });
  let retryCount = 0;
  while (true) {
    console.log(
      `Message Count: ${messages.length}, Earliest message: ${new Date(messages[0].timestamp * 1000).toLocaleString()}`
    );
    // Wait and see if more messages have appeared
    console.log(`Waiting for ${MESSAGE_RECHECK_SECONDS} seconds to see if more messages appear...`);
    await new Promise((resolve) => setTimeout(resolve, MESSAGE_RECHECK_SECONDS * 1000));
    const newMessages = await chat.fetchMessages({ limit: 1e9 });
    console.log(`Message count: ${messages.length} -> ${newMessages.length}`);
    if (messages.length >= newMessages.length) {
      retryCount++;
      console.log(`No new messages, done: ${retryCount} retries`);
      if (retryCount >= MESSAGE_MAX_RETRY_COUNT) {
        console.log(`Max retries reached, giving up.`);
        break;
      }
    } else {
      retryCount = 0;
      console.log(`Messages increased, giving more time to fetch more messages.`);
      messages = newMessages;
    }
  }

  return messages;
};

const serializeContact = (contact: Contact): ChatContactV1 => {
  return {
    id: contact.id._serialized,
    pushname: contact.pushname,
    phoneNumber: contact.number,
  };
};

const serializeBodyText = (text: string): ChatBodyTextV1 => {
  return { text: text };
};

const serializeVCards = (vCards: string[]): ChatVCardsV1 => {
  return { vCards: vCards };
};

const serializeWawMessage = async (wawMsg: Message): Promise<ChatMessageV1 | null> => {
  if (wawMsg.type === 'e2e_notification') {
    return null;
  }

  const quotedMessage = wawMsg.hasQuotedMsg
    ? await serializeWawMessage(await wawMsg.getQuotedMessage())
    : null;

  const contact = wawMsg.author ? serializeContact(await wawMsg.getContact()) : null;

  const serializedMsg: ChatMessageV1 = {
    id: wawMsg.id._serialized,
    body:
      wawMsg.type === 'revoked'
        ? { isDeleted: true }
        : wawMsg.vCards.length > 0
          ? serializeVCards(wawMsg.vCards)
          : serializeBodyText(wawMsg.body),
    timestamp: wawMsg.timestamp,
    contact,
    hasMedia: wawMsg.hasMedia,
    quotedMessage,
    wawMessageType: wawMsg.type,
  };

  return serializedMsg;
};

export const fetchMessages = async (chat: Chat): Promise<ChatMessageV1[]> => {
  const wawMessages = await downloadAllMessages(chat);
  const serializedOrNullMessages = await Promise.all(wawMessages.map(serializeWawMessage));
  const serializedMessages = serializedOrNullMessages.filter((msg) => msg !== null);
  return serializedMessages;
};

export const loadMessagesFromFile = async (filename: string): Promise<ChatMessageV1[]> => {
  const fs = await import('fs/promises');
  const fileContent = await fs.readFile(filename, 'utf-8');
  const { serializedMessages } = JSON.parse(fileContent);
  return serializedMessages;
};
