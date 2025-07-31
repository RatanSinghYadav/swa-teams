## How to configure the bot for a slack workspace and channel.

Few config is present as env variables, few are read from secrets  manager, few from parameter store and few from database. So its a mix. Read this carefully to fully understand.

For one bot to work seamlessly all these config needs to be set properly.

### Template File

- **Slack Signing Secret**:  The Slack app needs authentication. For this we need the slack token. This is kept in secrets manager, and read into template file and set as env variable. Env varibale **SWA_SLACK_SIGNING_SECRET** . Now we might need to change this. As if two different installation of slack bot is pointing to same lambda/code, we  need differnt tokens.

- **LLM Keys**: This is kept in secrets manager and read into template and set in env variable

- **LLM Models**: Again set in template and read into env directly.

- **Config Table**: This is the table where config for a slack team id and app is kept. Value is set in template itself and into env variable.

- **Token Queue**: SQS to sent token metrics. Set in template and read into env.


### Database

#### Instance Config Table
- Instance table key is : APPID_TeamID

- Sample entry is given below:

     >   {
        "instanceId": "A08ARK2CMNF_T07JWREL99P",
        "config": {
        "AGENT_TABLE": "agent-config-t07jwrel99p",
        "CHAT_HISTORY_TABLE": "bot-chat-history-beta",
        "S3Bucket": "swa-agent-descriptions-t07jwrel99p",
        "STATS_TABLE": "agent-stats-t07jwrel99p",
        "TOKEN_TABLE": "swa-token-billing-t07jwrel99p"
        },
        "tokenCount": "2000000"
        }

- **AGENT_TABLE** : Table to store the agent details. Including type , summary etc.
- **CHAT_HISTORY_TABLE**: Table to store the user and bot chat history. Should have a ttl set to delete old chat
- **S3Bucket**:  S3 bucket to store the agents description. Name of file is uuid and kept in agent table as reference.
- **STATS_TABLE**: Table to store the bot usage stats.
- **TOKEN_TABLE**: Table to store token related details
- **tokenCount**: Number of tokens available to this bot. This value will be decreased on usage, and increased on recharge. 

##### Agent Config Table
- Key is agent name in lower case. 
- Sort key is one of three values: userid from slack for user created bots, channel id for channel level bots and the value ADMIN for admin bots.
- fileId: uuid that is set as s3 file name for storing agent description
- summary: Auto generated summary from agent description. used in classifier to find the agent to be used.
- type: Type of agent. As of writing its one of openai, anthropic or perplexity.

#### Chat History Table
- this needs a primary key PK and secondary key SK. This cannot be changed. 
- set the timestamp field as ttl with expiry to delete old chats. 

## Secrets Manager
- Slack Token is retrieved from secrets manager using key appid_teamid. This is differnt from the auth token used earlier. This token is for posting messages to slack.

## Parameter Store
- Jira creds: User email, api domain and Token are store here.


## How Token Deduction Works

- After the bot posts response to user, the array of stats of usage generated from llms is sent to the sqs queue mentioned earlier. 

- A lambda listens to this queue, reads the messages in the body one by one and inserts into table *swa-token-billing-details* one by one. Event type is consume for reduction and yet to decided for rechager.

- This table has a streams set for insert events. This is consumed by swa-token-aggregator. It uses a lock to prevent missed reads and dirty writes etc to update value in instance config, tokencount field.

 