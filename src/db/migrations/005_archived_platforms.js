module.exports = {
  version: 5,
  name: "archived_platforms",
  async up(client) {
    await client.execute("ALTER TABLE platforms ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
};
