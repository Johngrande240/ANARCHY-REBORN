
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Set up the ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Tickets')
      .setDescription('Click a button below to create a support ticket')
      .setColor(0x00AEFF);
      
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_general')
        .setLabel('General Support')
        .setEmoji('🛠️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_donation')
        .setLabel('Donation')
        .setEmoji('💸')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_complaint')
        .setLabel('Complaint')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Danger)
    );
    
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_suggestion')
        .setLabel('Suggestion')
        .setEmoji('💡')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_bug')
        .setLabel('Bug Report')
        .setEmoji('🐞')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket_ban')
        .setLabel('Ban Appeal')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Danger)
    );
    
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_gang')
        .setLabel('Gang Creation')
        .setEmoji('🔥')
        .setStyle(ButtonStyle.Success)
    );
    
    await interaction.channel.send({ embeds: [embed], components: [row1, row2, row3] });
    await interaction.reply({ content: 'Ticket panel has been set up!', ephemeral: true });
  }
};
