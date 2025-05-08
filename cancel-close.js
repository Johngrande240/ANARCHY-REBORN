
module.exports = {
  data: { name: 'cancel_close' },
  
  async execute(interaction) {
    await interaction.update({ 
      content: 'Ticket close cancelled', 
      embeds: [], 
      components: [] 
    });
  }
};
