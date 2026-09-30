require('dotenv').config();

/**
 * CodeX Bot - Central Configuration File
 * Paste your Discord Bot Token and Client ID below.
 */
module.exports = {
    // Discord Bot Credentials
    // Get these from: https://discord.com/developers/applications
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.CLIENT_ID || "",
    guildId: process.env.GUILD_ID || "",

    // Web Dashboard Configuration
    dashboard: {
        port: process.env.PORT || 3001,
        secret: "codex-dashboard-secret-key-2026",
        callbackUrl: "http://localhost:3001/auth/callback"
    },

    // Community & Support Links
    links: {
        discord: "https://discord.gg/example",
        github: "https://github.com/example/codex-bot",
        youtube: "https://youtube.com/@example",
        donate: "https://ko-fi.com/example"
    }
};
