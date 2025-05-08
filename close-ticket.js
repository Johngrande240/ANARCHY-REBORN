
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  data: { name: 'close_ticket' },
  
  async execute(interaction) {
    const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: 'open' });
    
    if (!ticket) {
      return interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });
    }
    
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm_close')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Danger);
      
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_close')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
      
    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
    
    const embed = new EmbedBuilder()
      .setTitle('Close Ticket')
      .setDescription('Are you sure you want to close this ticket?')
      .setColor(0xFF0000);
      
    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
