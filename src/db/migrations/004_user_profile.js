module.exports = {
  version: 4,
  name: "user_profile_fields",
  async up(client) {
    await client.execute("ALTER TABLE users ADD COLUMN display_name TEXT");
    await client.execute("ALTER TABLE users ADD COLUMN avatar_data TEXT");
  }
};
