
class RoleManager {
  constructor() {
    this.tempRoles = new Map();
  }

  async addTempRole(member, role, duration) {
    try {
      await member.roles.add(role);
      const timeout = setTimeout(() => this.removeTempRole(member, role), duration);
      this.tempRoles.set(`${member.id}-${role.id}`, timeout);
      return true;
    } catch (error) {
      console.error('Error adding temporary role:', error);
      return false;
    }
  }

  async removeTempRole(member, role) {
    try {
      await member.roles.remove(role);
      const key = `${member.id}-${role.id}`;
      clearTimeout(this.tempRoles.get(key));
      this.tempRoles.delete(key);
      return true;
    } catch (error) {
      console.error('Error removing temporary role:', error);
      return false;
    }
  }
}

module.exports = new RoleManager();
