import { Command } from 'commander';
import { promises as fs } from 'fs';

import { fetchMessages, loadMessagesFromFile } from './DownloadMessages.js';
import { extractRecommendations, getLLMRequest } from './LLM.js';
import { createWhatsappService } from './Services/Whatsapp/WhatsappImpl.js';

const program = new Command();

program
  .name('neighborbot')
  .description('Organizes recommendations from neighborhood Whatsapp groups')
  .version('1.0.0');

program
  .command('list-chats')
  .description('List all chats')
  .action(async () => {
    console.log('Fetching all chats...');
    const whatsappService = createWhatsappService();
    const client = await whatsappService.getClient();
    const chats = await client.getChats();
    console.log('\nChats:');
    for (const chat of chats) {
      console.log(`- ${chat.name} (ID: ${chat.id._serialized})`);
    }
    process.exit(0);
  });

program
  .command('save-messages')
  .description('Save all messages from a chat to a JSON file')
  .argument('<chatId>', 'ID of the chat to fetch messages from')
  .argument('<filename>', 'File to save messages to')
  .action(async (chatId: string, filename: string) => {
    console.log('Fetching messages...');
    const whatsappService = createWhatsappService();
    const client = await whatsappService.getClient();
    const chat = await client.getChatById(chatId);
    const serializedMessages = await fetchMessages(chat);
    await fs.writeFile(filename, JSON.stringify({ serializedMessages, schema: 1 }, null, 2));

    console.log(`Saved ${serializedMessages.length} messages to ${filename}`);
    process.exit(0);
  });

program
  .command('update-messages')
  .description('Update saved messages with any new messages since last save')
  .argument('<chatId>', 'ID of the chat to fetch messages from')
  .argument('<filename>', 'File containing previously saved messages')
  .action(async (chatId: string, filename: string) => {
    console.log('Loading existing messages...');
    const existingMessages = await loadMessagesFromFile(filename);

    // Get the timestamp of the most recent message
    const latestTimestamp = Math.max(...existingMessages.map((m) => m.timestamp));

    console.log('Fetching new messages...');
    const whatsappService = createWhatsappService();
    const client = await whatsappService.getClient();
    const chat = await client.getChatById(chatId);
    const newMessages = await fetchMessages(chat);

    // Filter to only messages newer than our latest
    const newMessagesSince = newMessages.filter((m) => m.timestamp > latestTimestamp);

    if (newMessagesSince.length === 0) {
      console.log('No new messages found');
      process.exit(0);
    }

    console.log(`Found ${newMessagesSince.length} new messages`);

    // Combine existing and new messages
    const allMessages = [...existingMessages, ...newMessagesSince];

    // Save back to file
    await fs.writeFile(
      filename,
      JSON.stringify({ serializedMessages: allMessages, schema: 1 }, null, 2)
    );

    console.log(`Updated ${filename} with new messages`);
    process.exit(0);
  });

program
  .command('format-messages')
  .description('Format messages from a JSON file for LLM processing')
  .argument('<filename>', 'JSON file containing messages to format')
  .option(
    '-s, --start-date <date>',
    'Start date (inclusive, format: YYYY-MM-DD)',
    (date) => new Date(date)
  )
  .option(
    '-e, --end-date <date>',
    'End date (inclusive, format: YYYY-MM-DD)',
    (date) => new Date(date)
  )
  .action(async (filename: string, options: { startDate?: Date; endDate?: Date }) => {
    const messages = await loadMessagesFromFile(filename);
    const llmRequest = getLLMRequest(messages, options);
    console.log(llmRequest);
    process.exit(0);
  });

program
  .command('extract-recs')
  .description('Use an LLM to extract recommendations from a chat')
  .argument('<filename>', 'JSON file containing messages to format')
  .option(
    '-s, --start-date <date>',
    'Start date (inclusive, format: YYYY-MM-DD)',
    (date) => new Date(date)
  )
  .option(
    '-e, --end-date <date>',
    'End date (inclusive, format: YYYY-MM-DD)',
    (date) => new Date(date)
  )
  .action(async (filename: string, options: { startDate?: Date; endDate?: Date }) => {
    const messages = await loadMessagesFromFile(filename);

    // Get start and end dates
    const startDate =
      options.startDate || new Date(Math.min(...messages.map((m) => m.timestamp * 1000)));
    const endDate =
      options.endDate || new Date(Math.max(...messages.map((m) => m.timestamp * 1000)));

    let allRecs = '';
    let currentDate = new Date(startDate);

    // Iterate through each day
    while (currentDate <= endDate) {
      const startOfCurrentDate = new Date(currentDate);
      startOfCurrentDate.setHours(0, 0, 0, 0);
      const endOfCurrentDate = new Date(startOfCurrentDate);
      endOfCurrentDate.setHours(23, 59, 59, 999);

      const dayOptions = {
        startDate: startOfCurrentDate,
        endDate: endOfCurrentDate,
      };

      console.log(`Processing messages with options: ${JSON.stringify(dayOptions, null, 2)}`);

      const llmRequest = getLLMRequest(messages, dayOptions);
      if (llmRequest) {
        const dayRecs = await extractRecommendations(llmRequest);

        if (dayRecs && dayRecs.trim()) {
          allRecs += `=== ${startOfCurrentDate.toLocaleDateString()} -> ${endOfCurrentDate.toLocaleDateString()} ===\n${dayRecs}\n\n`;
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const recs = allRecs.trim();
    console.log(recs);
    process.exit(0);
  });

program
  .command('update-report')
  .description('Update recommendations report with new messages since last run')
  .argument('<messages-file>', 'JSON file containing messages')
  .argument('<report-file>', 'File to append recommendations to')
  .argument('<settings-file>', 'JSON settings file with latestTimestamp')
  .action(async (messagesFile: string, reportFile: string, settingsFile: string) => {
    // Load messages
    const messages = await loadMessagesFromFile(messagesFile);
    const minDate = new Date(Math.min(...messages.map((m) => m.timestamp * 1000)));

    // Load settings
    let settings;
    try {
      settings = JSON.parse(await fs.readFile(settingsFile, 'utf-8'));
    } catch {
      settings = {};
    }
    const startDate = new Date((settings.latestTimestamp || minDate.getTime()) + 1);

    // Set end date to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    const endDate = new Date(
      Math.min(yesterday.getTime(), Math.max(...messages.map((m) => m.timestamp * 1000)))
    );

    console.log(`Processing messages from ${startDate} to ${endDate}`);

    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const startOfCurrentDate = new Date(currentDate);
      startOfCurrentDate.setHours(0, 0, 0, 0);
      const endOfCurrentDate = new Date(startOfCurrentDate);
      endOfCurrentDate.setHours(23, 59, 59, 999);

      console.log(`Processing day: ${startOfCurrentDate.toLocaleDateString()}`);

      const dayOptions = {
        startDate: startOfCurrentDate,
        endDate: endOfCurrentDate,
      };

      const llmRequest = getLLMRequest(messages, dayOptions);
      if (llmRequest) {
        const recs = await extractRecommendations(llmRequest);

        if (recs && recs.trim()) {
          // Append to report file
          const reportEntry = `=== ${startOfCurrentDate.toLocaleDateString()} ===\n${recs}\n\n`;
          await fs.appendFile(reportFile, reportEntry);
          console.log('Updated report for', startOfCurrentDate.toLocaleDateString());
        } else {
          console.log('No recommendations found for', startOfCurrentDate.toLocaleDateString());
        }
      } else {
        console.log('No messages to process for', startOfCurrentDate.toLocaleDateString());
      }

      // Always update settings with new timestamp after processing each day
      settings.latestTimestamp = endOfCurrentDate.getTime();
      await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      console.log('Updated settings timestamp to', endOfCurrentDate.toLocaleDateString());

      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

const main = async (): Promise<void> => {
  try {
    await program.parseAsync(process.argv);
    console.log('Program parsed');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

await main();
