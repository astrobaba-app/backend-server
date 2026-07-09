const { sequelize } = require("./dbConnection/dbConfig");

const addReplyToMessageId = async () => {
  try {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.addColumn('ai_chat_messages', 'replyToMessageId', {
      type: require("sequelize").DataTypes.UUID,
      allowNull: true,
      comment: "ID of the message being replied to, if any",
    });
    console.log("Successfully added replyToMessageId to ai_chat_messages");
  } catch (err) {
    console.error("Error migrating:", err);
  } finally {
    process.exit(0);
  }
};

addReplyToMessageId();
