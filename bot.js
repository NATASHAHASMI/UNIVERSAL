const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Hello World!'));
const port = 8000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    const welcomeMessage = `<b>Hello, ${username}!</b>\n\n`
        + `<b>Welcome to the IndiaEarnX URL Shortener Bot!</b>\n`
        + `<b>Send any URL, and I will shorten it for you.</b>\n\n`
        + `<b>If you haven’t set your API token yet, use:</b>\n<code>/setapi YOUR_API_TOKEN</code>\n\n`;

    const options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: "Chat with Admin", url: "t.me/IndiaEarnXsupport" },
                 { text: "Payment Proof", url: "t.me/IndiaEarnx_Payment_Proofs" }],
                [{ text: "Get API Token", url: "https://indiaearnx.com/member/tools/quick" }]
            ]
        })
    };

    bot.sendPhoto(chatId, "https://envs.sh/dn1.jpg", {
        caption: welcomeMessage,
        parse_mode: "HTML",
        reply_markup: options.reply_markup
    });
});

// Command: /setapi
bot.onText(/\/setapi (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userToken = match[1].trim();

    // Save API token
    saveUserToken(chatId, userToken);

    bot.sendMessage(chatId, `IndiaEarnX API token set successfully.\nYour token: ${userToken}`);
});

// Listen for messages (URLs & Telegram post links)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    if (!messageText) return;

    // Extract all URLs
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = messageText.match(urlPattern);

    if (urls && urls.length > 0) {
        await shortenMultipleUrls(chatId, urls);
    } else if (messageText.includes("t.me/")) {
        await handleTelegramPost(chatId, messageText);
    }
});

// Function to shorten multiple URLs
async function shortenMultipleUrls(chatId, urls) {
    const apiToken = getUserToken(chatId);

    if (!apiToken) {
        bot.sendMessage(chatId, 'Please set your API token first using: /setapi YOUR_API_TOKEN');
        return;
    }

    let shortLinks = [];

    for (const url of urls) {
        try {
            const response = await axios.get(`https://indiaearnx.com/api?api=${apiToken}&url=${url}`);
            if (response.data.shortenedUrl) {
                shortLinks.push(response.data.shortenedUrl);
            }
        } catch (error) {
            console.error(`Error shortening URL (${url}):`, error);
        }
    }

    if (shortLinks.length > 0) {
        bot.sendMessage(chatId, `Shortened URLs:\n\n${shortLinks.join("\n")}`);
    } else {
        bot.sendMessage(chatId, 'Failed to shorten the URLs. Please check your API token.');
    }
}

// Function to handle Telegram post links
async function handleTelegramPost(chatId, messageText) {
    const apiToken = getUserToken(chatId);

    if (!apiToken) {
        bot.sendMessage(chatId, 'Please set your API token first using: /setapi YOUR_API_TOKEN');
        return;
    }

    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = messageText.match(urlPattern);

    if (!urls || urls.length === 0) {
        bot.sendMessage(chatId, 'No valid links found in the Telegram post.');
        return;
    }

    let newMessageText = messageText;

    for (const url of urls) {
        try {
            const response = await axios.get(`https://indiaearnx.com/api?api=${apiToken}&url=${url}`);
            if (response.data.shortenedUrl) {
                newMessageText = newMessageText.replace(url, response.data.shortenedUrl);
            }
        } catch (error) {
            console.error(`Error shortening URL (${url}):`, error);
        }
    }

    bot.sendMessage(chatId, `Updated Telegram Post:\n\n${newMessageText}`, { parse_mode: "HTML" });
}

// Function to save API token
function saveUserToken(chatId, token) {
    const dbData = getDatabaseData();
    dbData[chatId] = token;
    fs.writeFileSync('database.json', JSON.stringify(dbData, null, 2));
}

// Function to retrieve API token
function getUserToken(chatId) {
    const dbData = getDatabaseData();
    return dbData[chatId];
}

// Function to read database
function getDatabaseData() {
    try {
        return JSON.parse(fs.readFileSync('database.json', 'utf8'));
    } catch (error) {
        return {};
    }
}
// --------------- ADD THE NEW CODE HERE ----------------

// Listen for messages (Text, Photo, Video, or Document with Caption)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.photo || msg.video || msg.document) {
        if (msg.caption) {
            await processPostWithCaption(chatId, msg);
        }
    }
});

// Function to process media posts with captions
async function processPostWithCaption(chatId, msg) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    let caption = msg.caption;
    let urls = caption.match(urlPattern);

    if (urls && urls.length > 0) {
        for (let oldUrl of urls) {
            let newUrl = await shortenUrl(chatId, oldUrl);
            caption = caption.replace(oldUrl, newUrl);
        }
    } else {
        // If no link is found, add a default short link
        let defaultShortUrl = await shortenUrl(chatId, "https://example.com");
        caption += `\n🔗 ${defaultShortUrl}`;
    }

    // Send the updated post with the new caption
    if (msg.photo) {
        bot.sendPhoto(chatId, msg.photo[msg.photo.length - 1].file_id, { caption: caption, parse_mode: "HTML" });
    } else if (msg.video) {
        bot.sendVideo(chatId, msg.video.file_id, { caption: caption, parse_mode: "HTML" });
    } else if (msg.document) {
        bot.sendDocument(chatId, msg.document.file_id, { caption: caption, parse_mode: "HTML" });
    }
}

// Function to shorten a URL
async function shortenUrl(chatId, url) {
    const apiToken = getUserToken(chatId);
    if (!apiToken) {
        return "Please set your API token using /setapi";
    }

    try {
        const apiUrl = `https://indiaearnx.com/api?api=${apiToken}&url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        return response.data.shortenedUrl || url;  // If API fails, return the original URL
    } catch (error) {
        console.error('Shorten URL Error:', error);
        return url; // Return original link if error occurs
    }
}

// --------------- END OF NEW CODE ----------------
