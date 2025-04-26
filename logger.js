
const { EmbedBuilder } = require('discord.js');

class Logger {
  static #logQueue = [];
  static #isProcessing = false;
  static #rateLimitDelay = 1000;
  static #MAX_QUEUE_SIZE = 1000;
  
  static checkQueueSize() {
    if (this.#logQueue.length > this.#MAX_QUEUE_SIZE) {
      this.#logQueue = this.#logQueue.slice(-this.#MAX_QUEUE_SIZE);
      console.warn('Log queue exceeded maximum size, truncating...');
    }
  } // 1 second between logs
  static #errorCount = new Map();
  static #ERROR_THRESHOLD = 5;
  static #ERROR_WINDOW = 300000; // 5 minutes
  static #securityLogs = new Map();
  static #SECURITY_LOG_RETENTION = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  static logSecurity(guild, type, data) {
    const now = Date.now();
    const log = {
      timestamp: now,
      type,
      data
    };
    
    if (!this.#securityLogs.has(guild.id)) {
      this.#securityLogs.set(guild.id, []);
    }
    
    const logs = this.#securityLogs.get(guild.id);
    logs.push(log);
    
    // Clean old logs
    const cutoff = now - this.#SECURITY_LOG_RETENTION;
    this.#securityLogs.set(guild.id, logs.filter(l => l.timestamp > cutoff));
    
    // Alert on suspicious patterns
    this.analyzeSecurityLogs(guild, logs);
  }
  
  static analyzeSecurityLogs(guild, logs) {
    const recentLogs = logs.filter(l => l.timestamp > Date.now() - 300000);
    const suspiciousPatterns = {
      massJoins: recentLogs.filter(l => l.type === 'memberJoin').length > 10,
      massBans: recentLogs.filter(l => l.type === 'ban').length > 5,
      rapidCommands: recentLogs.filter(l => l.type === 'command').length > 50
    };
    
    if (Object.values(suspiciousPatterns).some(Boolean)) {
      this.alertAdmins(guild, suspiciousPatterns);
    }
  }

  static trackError(error, context) {
    const now = Date.now();
    const errorKey = `${error.name}-${context}`;
    
    if (!this.#errorCount.has(errorKey)) {
      this.#errorCount.set(errorKey, { count: 1, firstSeen: now });
    } else {
      const errorData = this.#errorCount.get(errorKey);
      errorData.count++;
      
      if (errorData.count >= this.#ERROR_THRESHOLD && 
          (now - errorData.firstSeen) <= this.#ERROR_WINDOW) {
        console.error(`Critical error rate detected for ${errorKey}`);
        // Alert administrators here
      }
    }
  }

  static async logEvent(guild, type, data) {
    try {
      const logChannel = guild.channels.cache.find(ch => ch.name === 'server-logs');
      if (!logChannel) return;

      // Add to queue
      Logger.#logQueue.push({ guild, type, data, logChannel });
      
      // Process queue if not already processing
      if (!Logger.#isProcessing) {
        Logger.#processQueue();
      }
    } catch (error) {
      console.error('Error in logger:', error);
    }
  }

  static async #processQueue() {
    if (Logger.#isProcessing || Logger.#logQueue.length === 0) return;
    
    Logger.#isProcessing = true;
    
    try {
      const { guild, type, data, logChannel } = Logger.#logQueue.shift();

      const embed = new EmbedBuilder()
        .setTimestamp()
        .setColor(0x0099FF);

      switch (type) {
        case 'memberJoin':
          embed.setTitle('👋 Member Joined')
            .setDescription(`${data.user.tag} joined the server`)
            .addFields({ name: 'Account Age', value: `${Math.floor((Date.now() - data.user.createdTimestamp) / 86400000)} days` });
          break;
        case 'memberLeave':
          embed.setTitle('👋 Member Left')
            .setDescription(`${data.user.tag} left the server`);
          break;
        case 'messageDelete':
          embed.setTitle('🗑️ Message Deleted')
            .setDescription(`Message by ${data.author.tag} deleted in ${data.channel}`)
            .addFields({ name: 'Content', value: data.content || 'No content' });
          break;
        case 'messageEdit':
          embed.setTitle('✏️ Message Edited')
            .setDescription(`Message by ${data.author.tag} edited in ${data.channel}`)
            .addFields(
              { name: 'Before', value: data.oldContent },
              { name: 'After', value: data.newContent }
            );
          break;
      }

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error processing log:', error);
    } finally {
      Logger.#isProcessing = false;
      
      // Process next item in queue if available
      if (Logger.#logQueue.length > 0) {
        setTimeout(() => Logger.#processQueue(), Logger.#rateLimitDelay);
      }
    }
  }
}

module.exports = Logger;
