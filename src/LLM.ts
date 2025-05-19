import { LMStudioClient } from '@lmstudio/sdk';
import dotenv from 'dotenv';
import Ical from 'ical.js';

import type { ChatMessageV1 } from './DownloadMessages.js';

dotenv.config();
const NEIGHBORHOOD_LOCATION = process.env.NEIGHBORHOOD_LOCATION;
if (!NEIGHBORHOOD_LOCATION) {
  throw new Error('NEIGHBORHOOD_LOCATION is not set in .env file');
}

const getLLLMPrompt = (): string => {
  return `The following chat logs is from a neighborhood group chat in ${NEIGHBORHOOD_LOCATION}. 

Please read each chat, and extract any business recommendations that people make. Please only note strong endorsements for businesses. 

DO NOT assume two people are recommending the same business unless they clearly mention the same business.

DO NOT include information just because it might be helfpul. It must be recommended.

DO NOT include references to businesses without a positive endorsement.

DO NOT include requests for recommendations. Only the recommendations themselves.

For each recommendation, please list the name of the business, a category for the business, any contact info (phone, email, website), and who recommended them with a relevant snippet (in the format "<Recommendation>" - <Recommender>). 

ONLY RESPOND WITH THE RECOMMENDATIONS. DO NOT include any other text or commentary.

DO NOT mention 'REPLY TO' recommendations in your response

There may not be any recommendations for a set of messages. That is fine! If there are no recommendations, respond only with "NO RECOMMENDATIONS".

Only include contact info if it is explicitly provided. Do not make up contact info or specify that it is not provided. DO NOT write things like: "- Email: not provided"

Please with the following structure and format your response as text:

<BUSINESS_NAME> - <BUSINESS_CATEGORY>
  "<Recommendation Quote>" - <Recommender>
  - <Email>
  - <Phone>
  - <Website>
  - <Address>

For example:

Best Plumbers Inc - Plumbing
  "They fixed my leaky faucet in 10 minutes" - John Doe
  - Email: bestplumbers@example.org
  - Website: https://www.example.org/bestplumbers  
  - Address: 123 Main St, Anytown, USA

Thank you.
---
`;
};

type StructuredVcard = {
  name?: string;
  phoneNumber?: string;
};

const getStructuredVcard = (vCardEncodedText: string): StructuredVcard => {
  const parsedVCard = Ical.parse(vCardEncodedText);
  const dataArray = parsedVCard[1];
  const structuredVcard: StructuredVcard = {};

  for (const element of dataArray) {
    if (element[0] === 'fn') {
      structuredVcard.name = element[3];
    }
    if (element[0] === 'tel') {
      structuredVcard.phoneNumber = element[3];
    }
  }

  return structuredVcard;
};

const getMessageBodyForLLM = (message: ChatMessageV1): string => {
  if ('isDeleted' in message.body) {
    return 'MESSAGE DELETED';
  } else if ('vCards' in message.body) {
    const structuredVCards = message.body.vCards.map(getStructuredVcard);
    return structuredVCards.map((vcard) => `${vcard.name}: ${vcard.phoneNumber}`).join('\n');
  } else if ('text' in message.body) {
    return message.body.text;
  } else {
    throw new Error(`Unknown message body type: ${JSON.stringify(message.body)}`);
  }
};

export const formatMessageForLLM = (
  message: ChatMessageV1,
  indentLevel: number = 0
): string | null => {
  const messageBody = getMessageBodyForLLM(message);
  const indent = ' '.repeat(indentLevel * 2);

  let formattedMessage = `${indent === '' && 'MESSAGE:\n'}${indent}FROM: ${message.contact?.pushname}
${indent}TIME: ${new Date(message.timestamp * 1000).toLocaleDateString()}
`;

  if (message.hasMedia) {
    formattedMessage += `${indent}<MEDIA REMOVED>\n`;
  }

  formattedMessage += `
${indent}${messageBody
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')}`;

  if (message.quotedMessage) {
    formattedMessage += `${indent}
${indent}
${indent}REPLY TO (DO NOT INCLUDE IN RECOMMENDATIONS):
${formatMessageForLLM(message.quotedMessage, indentLevel + 1)}`;
  }
  return formattedMessage;
};

export const getLLMRequest = (
  messages: ChatMessageV1[],
  options?: { startDate?: Date; endDate?: Date }
): string | null => {
  const startDate = options?.startDate || new Date(0);
  const endDate = options?.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  console.log(`Getting LLM request for messages from ${startDate} to ${endDate}`);

  const filteredMessages = messages.filter((message) => {
    const messageDate = new Date(message.timestamp * 1000);
    return messageDate >= startDate && messageDate <= endDate;
  });

  if (filteredMessages.length === 0) {
    return null;
  }

  let prompt = getLLLMPrompt();
  for (let i = 0; i < filteredMessages.length; i++) {
    const message = filteredMessages[i];
    const formattedMessage = formatMessageForLLM(message, 0);
    if (formattedMessage) {
      prompt += formattedMessage + '\n---\n';
    }
  }
  return prompt;
};

export const extractRecommendations = async (llmRequest: string): Promise<string | null> => {
  const lmsClient = new LMStudioClient();
  const model = await lmsClient.llm.model('deepseek-r1-distill-qwen-14b', {
    config: { contextLength: 8192 },
  });
  const result = await model.respond(llmRequest);

  // Remove the thought process from the response
  const filteredContent = result.content.replace(/<think>.*?<\/think>/gs, '').trim();

  if (filteredContent.includes('NO RECOMMENDATIONS')) {
    return null;
  }

  return filteredContent;
};

export const mergeRecommendations = async (recommendations: string): Promise<string> => {
  const prompt = `Here is a running list of recommendations. Please combine recommendations for the same business into one:\n
${recommendations}`;

  const lmsClient = new LMStudioClient();
  const model = await lmsClient.llm.model('deepseek-r1-distill-qwen-14b', {
    config: { contextLength: 4096 * 8 },
  });
  const result = await model.respond(prompt);

  // Remove the thought process from the response
  const filteredContent = result.content.replace(/<think>.*?<\/think>/gs, '').trim();

  return filteredContent;
};
