import type { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  type Chat,
  type Contact,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { toFile } from 'qrcode';
import qrcode from 'qrcode-terminal';

import type { WhatsappContact, WhatsappService } from './Whatsapp.d.ts';

const AUTH_DIR = '.baileys_auth';
const silentLogger = pino({ level: 'silent' });

type ConnectedData = {
  chats: Map<string, Chat>;
  contacts: Map<string, Contact>;
  messagesByJid: Map<string, WAMessage[]>;
};

// Accept existing maps so data accumulated before a restartRequired isn't lost
const connect = async (
  chats = new Map<string, Chat>(),
  contacts = new Map<string, Contact>(),
  messagesByJid = new Map<string, WAMessage[]>()
): Promise<ConnectedData> => {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestWaWebVersion();

  return new Promise<ConnectedData>((resolve, reject) => {
    const sock = makeWASocket({
      version,
      auth: state,
      logger: silentLogger,
      syncFullHistory: true,
      browser: Browsers.macOS('Desktop'),
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on(
      'messaging-history.set',
      ({ chats: histChats, contacts: histContacts, messages, isLatest }) => {
        console.log(`History sync: ${histChats.length} chats, ${messages.length} messages`);
        for (const chat of histChats) {
          if (chat.id) chats.set(chat.id, chat);
        }
        for (const contact of histContacts) {
          contacts.set(contact.id, contact);
        }
        for (const msg of messages) {
          const jid = msg.key.remoteJid;
          if (!jid) continue;
          if (!messagesByJid.has(jid)) messagesByJid.set(jid, []);
          messagesByJid.get(jid)!.push(msg);
        }
        if (isLatest) {
          if (chats.size > 0 || messages.length > 0) {
            console.log('History sync complete');
            resolve({ chats, contacts, messagesByJid });
          } else {
            // Empty isLatest — chats arrive via chats.upsert; let the timeout resolve
            console.log('Empty history sync, waiting for chats.upsert...');
          }
        }
      }
    );

    sock.ev.on('chats.upsert', (newChats) => {
      for (const chat of newChats) {
        if (chat.id) chats.set(chat.id, chat);
      }
      resolve({ chats, contacts, messagesByJid });
    });

    sock.ev.on('contacts.upsert', (newContacts) => {
      for (const contact of newContacts) {
        contacts.set(contact.id, contact);
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrPath = '/tmp/wa-qr.png';
        toFile(qrPath, qr, { scale: 8 })
          .then(() => console.log(`QR code saved to ${qrPath} — open it and scan with WhatsApp`))
          .catch(() => {
            // Fall back to terminal rendering if file write fails
            qrcode.generate(qr, { small: true });
          });
      }

      if (connection === 'open') {
        console.log('Whatsapp client is ready, waiting for history sync...');
        // Safety net: resolve after grace period if isLatest never fires
        setTimeout(() => resolve({ chats, contacts, messagesByJid }), 30000);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('WhatsApp logged out. Delete .baileys_auth and reconnect.'));
        } else if (statusCode === DisconnectReason.restartRequired) {
          // Pass accumulated data through so it isn't lost on reconnect
          connect(chats, contacts, messagesByJid).then(resolve, reject);
        } else {
          reject(new Error(`WhatsApp disconnected (status ${statusCode})`));
        }
      }
    });
  });
};

export const createWhatsappService = (): WhatsappService => {
  let connected: ConnectedData | null = null;
  const connectedPromise = connect().then((result) => {
    connected = result;
    return result;
  });

  return {
    getChats: async (): Promise<Array<{ id: string; name: string }>> => {
      const { chats } = await connectedPromise;
      return Array.from(chats.values()).map((chat) => ({
        id: chat.id ?? '',
        name: chat.name ?? chat.id ?? '',
      }));
    },

    getChatMessages: async (chatId: string): Promise<WAMessage[]> => {
      const { messagesByJid } = await connectedPromise;
      return messagesByJid.get(chatId) ?? [];
    },

    // Safe to call synchronously after awaiting getChats or getChatMessages,
    // since connected is populated once connectedPromise resolves.
    getContact: (jid: string): WhatsappContact | null => {
      const c = connected?.contacts.get(jid);
      if (!c) return null;
      return {
        id: c.id,
        pushname: c.notify ?? c.name ?? '',
        phoneNumber: c.phoneNumber ?? c.id.split('@')[0],
      };
    },
  };
};
