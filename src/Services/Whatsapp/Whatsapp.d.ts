import type WAWebJS from 'whatsapp-web.js';

export type WhatsappService = {
  // TODO: stop exposing the client
  getClient: () => Promise<WAWebJS.Client>;
};
