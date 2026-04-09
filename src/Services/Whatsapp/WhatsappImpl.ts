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
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const scheduleResolve = (delayMs: number) => {
      if (resolved) return;
      if (resolveTimer) clearTimeout(resolveTimer);
      resolveTimer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        console.log(`Resolving with ${messagesByJid.size} chats worth of messages`);
        resolve({ chats, contacts, messagesByJid });
      }, delayMs);
    };

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
          // Wait 5s after isLatest for messages.upsert events to arrive
          console.log('History sync isLatest received, waiting 5s for any pending messages...');
          scheduleResolve(5000);
        }
      }
    );

    // On reconnects with existing auth, new messages arrive via messages.upsert
    // rather than messaging-history.set.
    sock.ev.on('messages.upsert', ({ messages: newMsgs, type }) => {
      console.log(`messages.upsert (${type}): ${newMsgs.length} messages`);
      for (const msg of newMsgs) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;
        if (!messagesByJid.has(jid)) messagesByJid.set(jid, []);
        messagesByJid.get(jid)!.push(msg);
      }
      // Reset timer so we wait for all batches to finish arriving
      if (resolveTimer !== null) scheduleResolve(5000);
    });

    sock.ev.on('chats.upsert', (newChats) => {
      for (const chat of newChats) {
        if (chat.id) chats.set(chat.id, chat);
      }
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
            qrcode.generate(qr, { small: true });
          });
      }

      if (connection === 'open') {
        console.log('Whatsapp client is ready, waiting for history sync...');
        // Safety net: resolve after 5min if isLatest never fires
        scheduleResolve(300000);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`Connection closed, status: ${statusCode}`);
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('WhatsApp logged out. Delete .baileys_auth and reconnect.'));
        } else if (statusCode === DisconnectReason.restartRequired) {
          console.log('Reconnecting due to restartRequired...');
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
