
const Ticket = require('../models/Ticket');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: { name: 'confirm_close' },
  
  async execute(interaction) {
    const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: 'open' });
    
    if (!ticket) {
      return interaction.reply({ content: 'This is not an active ticket channel.', ephemeral: true });
    }
    
    ticket.status = 'closed';
    await ticket.save();
    
    const embed = new EmbedBuilder()
      .setTitle('Ticket Closed')
      .setDescription('This ticket will be deleted in 5 seconds...')
      .setColor(0xFF0000);
      
    await interaction.update({ embeds: [embed], components: [] });
    
    // Optional: save transcript here
    
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch (error) {
        console.error('Error deleting channel:', error);
      }
    }, 5000);
  }
};
