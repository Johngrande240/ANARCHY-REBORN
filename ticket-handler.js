
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');

const ticketTypes = {
  ticket_general: { name: 'General Support', emoji: '🛠️' },
  ticket_donation: { name: 'Donation', emoji: '💸' },
  ticket_complaint: { name: 'Complaint', emoji: '⚠️' },
  ticket_suggestion: { name: 'Suggestion', emoji: '💡' },
  ticket_bug: { name: 'Bug Report', emoji: '🐞' },
  ticket_ban: { name: 'Ban Appeal', emoji: '🔓' },
  ticket_gang: { name: 'Gang Creation', emoji: '🔥' }
};

module.exports = {
  data: { name: Object.keys(ticketTypes) },

  async execute(interaction) {
    const ticketType = ticketTypes[interaction.customId];
    if (!ticketType) return;

    const existing = await Ticket.findOne({ userId: interaction.user.id, status: 'open' });
    if (existing) {
      return interaction.reply({ content: 'You already have an open ticket.', ephemeral: true });
    }

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: process.env.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });

    await Ticket.create({
      userId: interaction.user.id,
      channelId: channel.id,
      type: ticketType.name,
      status: 'open'
    });

    const embed = new EmbedBuilder()
      .setTitle(`${ticketType.emoji} ${ticketType.name} Ticket`)
      .setDescription(`Welcome <@${interaction.user.id}>! Please explain your issue and a staff member will be with you shortly.`)
      .setColor(0x00AEFF);

    await channel.send({ content: `<@&${process.env.STAFF_ROLE_ID}>`, embeds: [embed] });
    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  }
};
