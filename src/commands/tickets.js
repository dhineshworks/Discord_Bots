const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    ChannelType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('ticket-panel')
            .setDescription('Send the interactive ticket creation panel')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        category: 'Support',
        async execute(interaction) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎫 Server Support & Inquiry Center')
                .setDescription('Need help, have a question, or need to report an incident?\nClick the button below to open a private ticket with our staff team.')
                .addFields(
                    { name: '⚡ Response Times', value: 'Usually under 1 hour' },
                    { name: '📋 Please Note', value: 'Keep your inquiry concise and avoid tagging staff directly.' }
                )
                .setFooter({ text: 'CodeX Bot Automated Ticket System' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket_btn')
                    .setLabel('Create Support Ticket')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: '✅ Ticket panel dispatched successfully!', ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('close')
            .setDescription('Close current ticket and save a transcript'),
        category: 'Support',
        async execute(interaction) {
            if (!interaction.channel.name.startsWith('ticket-')) {
                return interaction.reply({ content: '❌ This command can only be used inside active ticket channels.', ephemeral: true });
            }

            await interaction.reply('🔒 Generating transcript and closing ticket in 5 seconds...');

            // Fetch last 100 messages to save HTML transcript
            try {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const transcriptLines = messages.reverse().map(m => 
                    `[${m.createdAt.toLocaleTimeString()}] ${m.author.tag}: ${m.cleanContent}`
                ).join('\n');

                const transcriptPath = path.join(__dirname, '../../transcripts', `${interaction.channel.name}-${Date.now()}.txt`);
                fs.writeFileSync(transcriptPath, transcriptLines, 'utf-8');
            } catch (err) {
                console.error('Failed to save transcript:', err);
            }

            setTimeout(async () => {
                await interaction.channel.delete().catch(() => null);
            }, 5000);
        }
    }
];
