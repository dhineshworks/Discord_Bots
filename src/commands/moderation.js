const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a user from the server')
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
            .addUserOption(opt => opt.setName('target').setDescription('User to ban').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban').setRequired(false)),
        category: 'Moderation',
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);

            if (!member) {
                return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
            }
            if (!member.bannable) {
                return interaction.reply({ content: '❌ I cannot ban this user (they may have higher permissions than me).', ephemeral: true });
            }

            await member.ban({ reason });
            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('🔨 User Banned')
                .addFields(
                    { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a user from the server')
            .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
            .addUserOption(opt => opt.setName('target').setDescription('User to kick').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick').setRequired(false)),
        category: 'Moderation',
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);

            if (!member) {
                return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
            }
            if (!member.kickable) {
                return interaction.reply({ content: '❌ I cannot kick this user.', ephemeral: true });
            }

            await member.kick(reason);
            const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('👢 User Kicked')
                .addFields(
                    { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Timeout/mute a member for a given duration')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(opt => opt.setName('target').setDescription('User to mute').setRequired(true))
            .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for timeout').setRequired(false)),
        category: 'Moderation',
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const minutes = interaction.options.getInteger('duration');
            const reason = interaction.options.getString('reason') || 'No reason specified';
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);

            if (!member) {
                return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
            }

            const ms = minutes * 60 * 1000;
            await member.timeout(ms, reason);

            const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('🔇 Member Timed Out')
                .addFields(
                    { name: 'Target', value: target.tag, inline: true },
                    { name: 'Duration', value: `${minutes} minute(s)`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unmute')
            .setDescription('Remove timeout from a user')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(opt => opt.setName('target').setDescription('User to unmute').setRequired(true)),
        category: 'Moderation',
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);

            if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

            await member.timeout(null);
            await interaction.reply({ content: `✅ Timeout removed for **${target.tag}**.` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('clear')
            .setDescription('Bulk delete messages in the current channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to clear (1-100)').setRequired(true)),
        category: 'Moderation',
        async execute(interaction) {
            const amount = interaction.options.getInteger('amount');
            if (amount < 1 || amount > 100) {
                return interaction.reply({ content: 'Please enter a number between 1 and 100.', ephemeral: true });
            }

            const deleted = await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `🧹 Successfully deleted **${deleted.size}** messages.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Issue a formal warning to a server member')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(opt => opt.setName('target').setDescription('User to warn').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)),
        category: 'Moderation',
        async execute(interaction) {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason');

            const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('⚠️ Formal Warning Issued')
                .addFields(
                    { name: 'Warned Member', value: target.tag, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('slowmode')
            .setDescription('Set slowmode delay for this channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
            .addIntegerOption(opt => opt.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true)),
        category: 'Moderation',
        async execute(interaction) {
            const seconds = interaction.options.getInteger('seconds');
            await interaction.channel.setRateLimitPerUser(seconds);
            await interaction.reply({ content: `⏱️ Slowmode has been set to **${seconds}** second(s).` });
        }
    }
];
