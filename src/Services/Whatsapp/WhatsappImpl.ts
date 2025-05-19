import qrcode from 'qrcode-terminal';
import WAWebJS from 'whatsapp-web.js';

import type { WhatsappService } from './Whatsapp.d.ts';

const { Client, LocalAuth } = WAWebJS;

export const createWhatsappService = (): WhatsappService => {
  const clientPromise = new Promise<WAWebJS.Client>((resolve) => {
    const client = new Client({
      authStrategy: new LocalAuth(),
    });

    client.on('ready', () => {
      console.log('Whatsapp client is ready');
      resolve(client);
    });

    client.on('qr', (qr) => {
      console.log('QR RECEIVED');
      qrcode.generate(qr, { small: true });
    });

    client.initialize().catch((error) => {
      console.error('Failed to initialize WhatsApp client:', error);
      throw error;
    });
  });

  const getClient = (): Promise<WAWebJS.Client> => {
    console.log('Getting client');
    return clientPromise;
  };

  return {
    getClient,
  };
};
