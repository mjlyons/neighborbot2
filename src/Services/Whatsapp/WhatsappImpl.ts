import type { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeInMemoryStore,
  useMultiFileAuthState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

import type { WhatsappContact, WhatsappService } from './Whatsapp.d.ts';

const AUTH_DIR = '.baileys_auth';
const silentLogger = pino({ level: 'silent' });

type ConnectedService = {
  store: ReturnType<typeof makeInMemoryStore>;
  messagesByJid: Map<string, WAMessage[]>;
};

const connect = async (): Promise<ConnectedService> => {
  const messagesByJid = new Map<string, WAMessage[]>();
  const store = makeInMemoryStore({ logger: silentLogger });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  return new Promise<ConnectedService>((resolve, reject) => {
    const sock = makeWASocket({
      auth: state,
      logger: silentLogger,
      syncFullHistory: true,
      browser: Browsers.macOS('Desktop'),
    });

    store.bind(sock.ev);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messaging-history.set', ({ messages, isLatest }) => {
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;
        if (!messagesByJid.has(jid)) messagesByJid.set(jid, []);
        messagesByJid.get(jid)!.push(msg);
      }
      if (isLatest) {
        console.log('History sync complete');
        resolve({ store, messagesByJid });
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('QR RECEIVED');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        console.log('Whatsapp client is ready');
        // Safety net: resolve after grace period if no history sync fires
        setTimeout(() => resolve({ store, messagesByJid }), 5000);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('WhatsApp logged out. Delete .baileys_auth and reconnect.'));
        } else {
          reject(new Error(`WhatsApp disconnected (status ${statusCode})`));
        }
      }
    });
  });
};

export const createWhatsappService = (): WhatsappService => {
  let connected: ConnectedService | null = null;
  const connectedPromise = connect().then((result) => {
    connected = result;
    return result;
  });

  return {
    getChats: async (): Promise<Array<{ id: string; name: string }>> => {
      const { store } = await connectedPromise;
      return store.chats.all().map((chat) => ({
        id: chat.id,
        name: chat.name ?? chat.id,
      }));
    },

    getChatMessages: async (chatId: string): Promise<WAMessage[]> => {
      const { messagesByJid } = await connectedPromise;
      return messagesByJid.get(chatId) ?? [];
    },

    // Safe to call synchronously after any await on getChats/getChatMessages,
    // since connected is populated once connectedPromise resolves.
    getContact: (jid: string): WhatsappContact | null => {
      const c = connected?.store.contacts[jid];
      if (!c) return null;
      return {
        id: c.id,
        pushname: c.notify ?? c.name ?? '',
        phoneNumber: c.phoneNumber ?? c.id.split('@')[0],
      };
    },
  };
};
