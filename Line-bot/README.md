# LINE-Bot-PythonDev

## What is LINE Messaging API
![line-overview](img/line-overview.png)

[Messaging API overview](https://developers.line.biz/en/docs/messaging-api/overview/#page-title) - Requests are sent over **HTTPS** in **JSON**. The communication flow between a bot server and the LINE Platform is as follows:

1. A user sends a message to a LINE Official Account.
2. The LINE Platform sends a webhook event to the webhook URL of the bot server.
3. The bot server checks the webhook event and responds to the user through the LINE Platform. *(with your coding/logic)*

\
**What's LINE Messaging API can do?**
1. Send reply messages
2. Send messages at any time
3. **Send different message types**
    1. Text message
    2. Sticker message
    3. Image message
    4. Video message
    5. Audio message
    6. Location message
    7. Imagemap message
    8. Template message
    9. Flex Message
4. Get content sent by users
5. Get user profiles
6. Join group chats
7. Use rich menus
8. Use beacons
9. Use account link
10. Get the number of sent messages


## Create Virtual Environment
Run following command in your working directory
```
virtualenv venv
```
where, `venv` is your virtual environment name

## Activate Virtual Environment
Run following command in your working directory
```
source venv/bin/activate
```

## Install Python Package
There's 3 required packages:
1. line-bot-sdk
2. fastapi
3. uvicorn
4. python-dotenv

To install latest version, run `pip` command to install 
```
pip install line-bot-sdk fastapi uvicorn python-dotenv
```
Or, you can install with the `requirements.txt`
```
pip install -r requirements.txt
```

## Environment Configuration
Create file `.env` and put your token inside.

```
ACCESS_TOKEN=<Your channel access token>
CHANNEL_SECRET=<Your channel secret>
DEFAULT_PRICE_PER_LITER=34.5
DAILY_FORM_URL=https://forms.gle/your-oil-log-form
```

## Running FastAPI
Using following command to run FastAPI on port 8000:
```
uvicorn main:app --port 8000 --reload
```
The `reload` flag is for reload everytime that file made change.

## Docker Deployment (with HTTPS tunnel)
1. Copy the sample env file and fill in your LINE secrets plus optional defaults:
    ```bash
    cd Line-bot
    cp .env.example .env
    # edit .env accordingly
    ```
2. From the project root, build and launch both the webhook container and the bundled Cloudflare quick tunnel (which gives you a free HTTPS URL):
    ```bash
    docker compose up -d line-webhook cloudflare-tunnel
    ```
    - `line-webhook` listens on http://localhost:8100 so you can test locally.
    - `cloudflare-tunnel` prints a `https://<random>.trycloudflare.com` address in its logs; that URL terminates HTTPS at Cloudflare and forwards traffic into `line-webhook`.
3. Grab the URL from the tunnel logs whenever the container restarts:
    ```bash
    docker compose logs -f cloudflare-tunnel
    ```
    Copy the `https://…trycloudflare.com/callback` value into the LINE Developers Console and enable webhooks.
4. Rebuild the webhook image whenever you change dependencies or code:
    ```bash
    docker compose up -d --build line-webhook
    ```
5. Prefer a permanent HTTPS endpoint (reverse proxy, named tunnel, etc.) for production, but the bundled tunnel is ideal for quick tests.