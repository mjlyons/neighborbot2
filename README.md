# Neighborbot

Downloads messages from a Whatsapp neighborhood group chat and
keeps a runing summary of recommended local businesses.

## Setup

### 1. Install LM Studio

LM Studio is used to run local LLM models (rather than sending your
data to an online service)

- [Install LM Studio](https://lmstudio.ai/)
- Download the local LLM model:

```
lms get DeepSeek-R1-Distill-Qwen-14B-GGUF
```

- You'll need to pick `bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF`

### 2. Get and install this source

- Clone this repo
- `npm install`

### 3. Install correct Nodejs version

- Install [nvm](https://github.com/nvm-sh/nvm)
- Install node version:

```
nvm install 20
nvm use 20
```

### 4. Configure environment:

- Create a .env file in the root of your clone:

```
NEIGHBORHOOD_LOCATION="Boston, MA, USA"
```

### 5. Authenticate Whatsapp and get group chat ID

- Run the command below. You'll need to scan a QR code on your phone to
  authenticate Whatsapp with your user

```
npm run dev -- list-chats
```

- Find the chat group you want to monitor, and copy the chat-id for the next step.

## Running the bot

### 1. Download and cache new messages:

```
npm run dev -- update-messages <chat-id> <saved-message-file.json>
```

### 2. Extract new recommendations into report:

```
npm run dev -- update-report <saved-message-file.json> <recomendation-report-file.txt> <settings-file.json>
```

Your running recomendations will be in <recomendation-report-file.txt>. Enjoy!

## Running the bot automatically

I like to run the bot every day at noon automatically using `crontab`. I also use [Dead Man's Snitch](https://deadmanssnitch.com/) to let me know if anything is erroring out.

To do this, create a shell script like the example below. I like to keep it in my `~/scripts` folder. Don't forget to make it executable (`chmod +x <your-script-file.sh>).

Be sure to replace things in `<...>` with your values!

```
#!/usr/bin/env bash

# Abort immediately if any command below fails
set -e

# Navigate to the neighborbot2 directory
cd ~/src/neighborbot2

# Initialize nvm for crontab environment and switch to correct node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm use 20
echo "Node version: $(node -v)"

echo "Updating messages..."
npm run dev -- update-messages <chat-id> <saved-message-file.json>

echo "Updating report..."
npm run dev -- update-report <saved-message-file.json> <recomendation-report-file.txt> <settings-file.json>

echo "Telling Dead Mans Snitch that update was successful..."
curl <dead-mans-snitch-url>

echo "DONE UPDATING"
```

You'll also configure crontab to run this script daily at noon by running `crontab -e` and entering this line:

```
00 12 * * * /Users/<your-username>/scripts/update-neighborbot.sh > /tmp/neighborbot.log 2>&1
```

Be sure to update <your-username>!

You can open /tmp/neighborbot.log to see the stdout & stderr from the last run.
