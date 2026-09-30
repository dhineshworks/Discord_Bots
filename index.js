const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');
const { startDashboard } = require('./src/dashboard/server.js');
const { registerSlashCommands } = require('./src/register-commands.js');
const { joinTargetVoice } = require('./src/voice.js');

// Prevent crashes on unhandled Discord or async rejections
process.on('unhandledRejection', error => {
    console.error('[Unhandled Rejection]', error?.message || error);
});

process.on('uncaughtException', error => {
    console.error('[Uncaught Exception]', error?.message || error);
});

function createDiscordClient(privileged = false) {
    const intents = privileged
        ? [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildVoiceStates
          ]
        : [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildVoiceStates
          ];

    const client = new Client({
        intents,
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction
        ]
    });

    client.commands = new Collection();

    // Load Commands
    const generalCmds = require('./src/commands/general.js');
    const modCmds = require('./src/commands/moderation.js');
    const ticketCmds = require('./src/commands/tickets.js');
    const engageCmds = require('./src/commands/engagement.js');
    const musicCmds = require('./src/commands/music.js');

    [...generalCmds, ...modCmds, ...ticketCmds, ...engageCmds, ...musicCmds].forEach(cmd => {
        client.commands.set(cmd.data.name, cmd);
    });

    // Load Event Handlers
    const interactionHandler = require('./src/events/interactionCreate.js');
    const messageHandler = require('./src/events/messageCreate.js');
    const memberJoinHandler = require('./src/events/guildMemberAdd.js');

    client.on('interactionCreate', (interaction) => interactionHandler(client, interaction));
    client.on('messageCreate', (message) => messageHandler(client, message));
    client.on('guildMemberAdd', (member) => memberJoinHandler(client, member));

    client.once('ready', () => {
        console.log(`\n=================================================`);
        console.log(`🤖 Logged into Discord as: ${client.user.tag}`);
        console.log(`📊 Connected Servers: ${client.guilds.cache.size}`);
        console.log(`👥 Monitoring Users: ${client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)}`);
        console.log(`🛡️ Loaded Commands: ${client.commands.size}`);
        console.log(`=================================================\n`);

        // Update settings.json with real stats
        try {
            const settingsPath = path.join(__dirname, 'settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            settings.stats = settings.stats || {};
            settings.stats.lastKnownServers = client.guilds.cache.size;
            settings.stats.lastKnownUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        } catch (e) {
            // ignore
        }

        // Register slash commands with Discord
        registerSlashCommands();

        // Auto-join General Lounge voice channel
        setTimeout(() => {
            joinTargetVoice(client, 'General Lounge');
        }, 1500);
    });

    return client;
}

// Start with standard intents (compatible with all bot applications immediately)
let client = createDiscordClient(false);
const extraClients = [];

// Start Web Dashboard with full multi-bot support
startDashboard(() => ({
    mainClient: client,
    extraClients,
    getAllClients: () => [client, ...extraClients]
}), config);

// Login to Discord
const token = config.token;
if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
    console.log(`\n⚠️  [SETUP NOTICE] Bot token not yet configured in config.js.`);
    console.log(`👉 The Web Dashboard is LIVE right now at: http://localhost:${config.dashboard.port || 3001}`);
    console.log(`👉 Once you add your Discord Bot Token & Client ID to config.js, the bot will connect to Discord automatically!\n`);
} else {
    client.login(token).then(() => {
        // Support connecting additional bots to the voice channel if tokens provided
        const extraTokens = (process.env.EXTRA_BOT_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);
        for (const extToken of extraTokens) {
            const extraClient = new Client({
                intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
            });
            extraClients.push(extraClient);
            extraClient.once('ready', () => {
                console.log(`🤖 Extra Bot Connected: ${extraClient.user.tag}`);
                setTimeout(() => joinTargetVoice(extraClient, 'General Lounge'), 1500);
            });
            extraClient.on('guildCreate', (guild) => {
                console.log(`🎉 Extra Bot ${extraClient.user.tag} added to server: ${guild.name}`);
                setTimeout(() => joinTargetVoice(extraClient, 'General Lounge', guild), 1000);
            });
            extraClient.login(extToken).catch(err => {
                console.warn(`[Extra Bot Login Error]:`, err.message);
            });
        }
    }).catch(err => {
        console.error('❌ Discord Login Failed:', err.message);
        console.log('👉 Dashboard remains active at: http://localhost:' + (config.dashboard.port || 3001));
    });
}
