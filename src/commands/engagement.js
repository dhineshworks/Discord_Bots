const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

function getSettings() {
    const p = path.join(__dirname, '../../settings.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Host an interactive giveaway')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addStringOption(opt => opt.setName('prize').setDescription('What is the giveaway prize?').setRequired(true))
            .addIntegerOption(opt => opt.setName('minutes').setDescription('Duration in minutes').setRequired(true))
            .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setRequired(false)),
        category: 'Engagement',
        async execute(interaction) {
            const prize = interaction.options.getString('prize');
            const minutes = interaction.options.getInteger('minutes');
            const winnerCount = interaction.options.getInteger('winners') || 1;
            const endsAt = Date.now() + minutes * 60 * 1000;

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎉 GIVEAWAY: ${prize}`)
                .setDescription(`Click 🎉 to participate!\n\n**Hosted by:** ${interaction.user}\n**Winners:** \`${winnerCount}\`\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`)
                .setFooter({ text: 'CodeX Giveaway Engine' })
                .setTimestamp(endsAt);

            const msg = await interaction.channel.send({ embeds: [embed] });
            await msg.react('🎉');
            await interaction.reply({ content: `✅ Giveaway for **${prize}** started!`, ephemeral: true });

            // Schedule winner draw
            setTimeout(async () => {
                const fetchedMsg = await interaction.channel.messages.fetch(msg.id).catch(() => null);
                if (!fetchedMsg) return;

                const reaction = fetchedMsg.reactions.cache.get('🎉');
                const users = await reaction?.users.fetch();
                const eligible = users?.filter(u => !u.bot).map(u => u);

                if (!eligible || eligible.length === 0) {
                    return interaction.channel.send(`🎉 Giveaway for **${prize}** ended! No valid entries found.`);
                }

                // Pick random winners
                const winners = [];
                for (let i = 0; i < Math.min(winnerCount, eligible.length); i++) {
                    const pickedIndex = Math.floor(Math.random() * eligible.length);
                    winners.push(eligible.splice(pickedIndex, 1)[0]);
                }

                const endEmbed = new EmbedBuilder()
                    .setColor('#23a55a')
                    .setTitle(`🎉 GIVEAWAY ENDED: ${prize}`)
                    .setDescription(`**Winner(s):** ${winners.map(w => `<@${w.id}>`).join(', ')}\nHosted by: ${interaction.user}`)
                    .setTimestamp();

                await fetchedMsg.edit({ embeds: [endEmbed] });
                await interaction.channel.send(`🎉 Congratulations ${winners.map(w => `<@${w.id}>`).join(', ')}! You won **${prize}**!`);
            }, minutes * 60 * 1000);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('rules')
            .setDescription('Display the server rules from dashboard settings'),
        category: 'Customization',
        async execute(interaction) {
            const settings = getSettings();
            const rulesList = settings.modules.rules.rulesList || [];

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📜 ${interaction.guild.name} - Official Rules`)
                .setDescription(rulesList.join('\n\n') || 'No rules configured yet.')
                .setFooter({ text: 'Please respect all rules and staff instructions.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('suggest')
            .setDescription('Submit a suggestion for the server')
            .addStringOption(opt => opt.setName('idea').setDescription('Your suggestion idea').setRequired(true)),
        category: 'Engagement',
        async execute(interaction) {
            const idea = interaction.options.getString('idea');
            const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('💡 New Server Suggestion')
                .setDescription(idea)
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .setFooter({ text: 'Vote using the buttons below!' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('suggest_upvote').setLabel('Upvote (0)').setEmoji('👍').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('suggest_downvote').setLabel('Downvote (0)').setEmoji('👎').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ content: '✅ Suggestion posted!', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
    }
];
