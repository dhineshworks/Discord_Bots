const { REST, Routes } = require('discord.js');
const config = require('../config.js');
const generalCmds = require('./commands/general.js');
const modCmds = require('./commands/moderation.js');
const ticketCmds = require('./commands/tickets.js');
const engageCmds = require('./commands/engagement.js');
const musicCmds = require('./commands/music.js');

const allCommands = [
    ...generalCmds,
    ...modCmds,
    ...ticketCmds,
    ...engageCmds,
    ...musicCmds
].map(c => c.data.toJSON());

async function registerSlashCommands(passedClientId) {
    if (!config.token || config.token === 'YOUR_BOT_TOKEN_HERE') {
        console.log('[Slash Commands] No valid token in config.js. Skipping command registration.');
        return;
    }

    let clientId = passedClientId || config.clientId;
    if (!clientId || clientId === 'YOUR_CLIENT_ID_HERE') {
        try {
            clientId = Buffer.from(config.token.split('.')[0], 'base64').toString('ascii');
        } catch (e) {
            console.log('[Slash Commands] Could not derive clientId. Skipping command registration.');
            return;
        }
    }

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log(`[Slash Commands] Refreshing ${allCommands.length} application (/) commands...`);

        if (config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, config.guildId),
                { body: allCommands }
            );
            console.log(`[Slash Commands] Successfully registered commands to Guild: ${config.guildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: allCommands }
            );
            console.log('[Slash Commands] Successfully registered global application commands!');
        }
    } catch (error) {
        console.error('[Slash Commands] Error deploying commands:', error);
    }
}

if (require.main === module) {
    registerSlashCommands();
}

module.exports = { registerSlashCommands, allCommands };
