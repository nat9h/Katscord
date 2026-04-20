import BotApp from "#core/BotApp";

const config = {
	token: process.env.USER_TOKEN,
	spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
	spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
	cookiesPath: process.env.COOKIES_PATH || "./cookies.txt",
	settingsPath: process.env.SETTINGS_PATH || "./data/settings.json",
	ownerIds: (process.env.OWNER_IDS || "")
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean),
};

if (!config.token) {
	console.error("Missing required environment variable: USER_TOKEN");
	process.exit(1);
}

const bot = new BotApp(config);

bot.start()
	.then(() => {
		console.log("Bot started successfully!");
	})
	.catch((error) => {
		console.error("Failed to start bot:", error);
		process.exit(1);
	});
