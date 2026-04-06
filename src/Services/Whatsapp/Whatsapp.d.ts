import type { WAMessage } from '@whiskeysockets/baileys';

export type WhatsappChat = {
  id: string; // JID string, e.g. "12345678901234567890@g.us"
  name: string;
};

export type WhatsappContact = {
  id: string;
  pushname: string;
  phoneNumber: string;
};

export type WhatsappService = {
  getChats: () => Promise<WhatsappChat[]>;
  getChatMessages: (chatId: string) => Promise<WAMessage[]>;
  getContact: (jid: string) => WhatsappContact | null;
};
