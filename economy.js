
const fs = require('fs');

class Economy {
  constructor() {
    this.data = this.loadData();
    this.levelConfig = {
      baseXP: 100,
      multiplier: 1.5
    };
  }

  calculateXPForLevel(level) {
    return Math.floor(this.levelConfig.baseXP * Math.pow(this.levelConfig.multiplier, level - 1));
  }

  addXP(userId, amount) {
    if (!this.data[userId]) {
      this.data[userId] = { balance: 0, xp: 0, level: 1 };
    }
    
    this.data[userId].xp += amount;
    
    // Check for level up
    const nextLevelXP = this.calculateXPForLevel(this.data[userId].level);
    if (this.data[userId].xp >= nextLevelXP) {
      this.data[userId].level += 1;
      this.data[userId].xp -= nextLevelXP;
      this.saveData();
      return this.data[userId].level;
    }
    
    this.saveData();
    return false;
  }

  loadData() {
    try {
      if (!fs.existsSync('economy.json')) {
        fs.writeFileSync('economy.json', '{}', 'utf8');
        return {};
      }
      const data = JSON.parse(fs.readFileSync('economy.json', 'utf8'));
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid data structure');
      }
      return data;
    } catch (error) {
      console.error('Error loading economy data:', error);
      // Create backup of corrupted file
      if (fs.existsSync('economy.json')) {
        fs.copyFileSync('economy.json', `economy.backup.${Date.now()}.json`);
      }
      return {};
    }
  }

  validateAmount(amount) {
    return Number.isInteger(amount) && amount > 0 && amount < 1000000;
  }

  saveData() {
    try {
      const tempFile = 'economy.temp.json';
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2));
      fs.renameSync(tempFile, 'economy.json');
      return true;
    } catch (error) {
      console.error('Error saving economy data:', error);
      return false;
    }
  }

  getBalance(userId) {
    return this.data[userId]?.balance || 0;
  }

  addMoney(userId, amount) {
    try {
      if (!this.validateAmount(amount)) {
        throw new Error('Invalid amount');
      }
      if (!this.data[userId]) this.data[userId] = { balance: 0 };
      this.data[userId].balance += amount;
      if (!this.saveData()) {
        throw new Error('Failed to save data');
      }
      return this.data[userId].balance;
    } catch (error) {
      console.error('Error in addMoney:', error);
      return false;
    }
  }

  getLeaderboard() {
    return Object.entries(this.data)
      .sort(([,a], [,b]) => b.balance - a.balance)
      .slice(0, 10);
  }

  async work(userId) {
    const earnings = Math.floor(Math.random() * 100) + 50;
    return this.addMoney(userId, earnings);
  }

  async daily(userId) {
    if (!this.data[userId]?.lastDaily || 
        Date.now() - this.data[userId].lastDaily >= 86400000) {
      if (!this.data[userId]) this.data[userId] = { balance: 0 };
      this.data[userId].lastDaily = Date.now();
      return this.addMoney(userId, 200);
    }
    return false;
  }
}

const economy = new Economy();

// Cleanup method
process.on('SIGINT', () => {
  economy.saveData();
  process.exit(0);
});

module.exports = economy;
