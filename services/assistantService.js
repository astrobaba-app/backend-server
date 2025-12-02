const Astrologer = require("../model/astrologer/astrologer");
const Blog = require("../model/blog/blog");
const Review = require("../model/review/review");
const AssistantPlan = require("../model/assistant/assistantPlan");
const AssistantChat = require("../model/assistant/assistantChat");
const { Op } = require("sequelize");

class AssistantService {
  /**
   * Build context for AI assistant based on astrologer's plan
   */
  async buildAssistantContext(astrologerId, assistantPlan) {
    const context = {
      astrologerProfile: null,
      blogs: [],
      reviews: [],
      features: assistantPlan.features,
    };

    try {
      // Always include astrologer profile (all plans)
      const astrologer = await Astrologer.findByPk(astrologerId, {
        attributes: [
          "id",
          "fullName",
          "photo",
          "bio",
          "skills",
          "languages",
          "yearsOfExperience",
          "rating",
          "totalConsultations",
          "pricePerMinute",
          "education",
          "specialization",
        ],
      });

      if (astrologer) {
        context.astrologerProfile = astrologer.toJSON();
      }

      // Include blogs if plan allows
      if (assistantPlan.features.blogAccess) {
        const blogs = await Blog.findAll({
          where: {
            astrologerId,
            isPublished: true,
          },
          attributes: ["id", "title", "content", "category", "tags", "createdAt"],
          order: [["createdAt", "DESC"]],
          limit: 10, // Last 10 blogs
        });

        context.blogs = blogs.map((blog) => blog.toJSON());
      }

      // Include reviews if plan allows
      if (assistantPlan.features.reviewAccess) {
        const reviews = await Review.findAll({
          where: {
            astrologerId,
          },
          attributes: ["rating", "comment", "createdAt"],
          order: [["createdAt", "DESC"]],
          limit: 20, // Last 20 reviews
        });

        context.reviews = reviews.map((review) => review.toJSON());
      }

      return context;
    } catch (error) {
      console.error("Error building assistant context:", error);
      throw error;
    }
  }

  /**
   * Generate system prompt for AI assistant
   */
  generateSystemPrompt(astrologer, assistantPlan, context) {
    const assistantName = assistantPlan.assistantName || `${astrologer.fullName}'s Assistant`;
    
    let systemPrompt = `You are ${assistantName}, an AI assistant for ${astrologer.fullName}, a professional astrologer.

**About ${astrologer.fullName}:**
- Experience: ${astrologer.yearsOfExperience} years
- Rating: ${astrologer.rating}/5 from ${astrologer.totalConsultations} consultations
- Skills: ${Array.isArray(astrologer.skills) ? astrologer.skills.join(", ") : astrologer.skills}
- Languages: ${Array.isArray(astrologer.languages) ? astrologer.languages.join(", ") : astrologer.languages}
- Specialization: ${astrologer.specialization || "General Astrology"}
- Bio: ${astrologer.bio}

**Your Role:**
- Help users understand ${astrologer.fullName}'s expertise and services
- Answer questions about astrology based on ${astrologer.fullName}'s knowledge
- Guide users on when to book a consultation
- Provide general astrological insights (not personal predictions)
- Be professional, friendly, and helpful

**Important Guidelines:**
- You are an assistant, NOT the astrologer themselves
- Do NOT provide personalized birth chart readings or predictions (that requires paid consultation)
- Encourage users to book a consultation for detailed readings
- Current consultation rate: ₹${astrologer.pricePerMinute}/minute
- Stay within the scope of ${astrologer.fullName}'s expertise: ${Array.isArray(astrologer.skills) ? astrologer.skills.join(", ") : astrologer.skills}
`;

    // Add blog context if available
    if (context.blogs && context.blogs.length > 0) {
      systemPrompt += `\n**${astrologer.fullName}'s Recent Blog Posts:**\n`;
      context.blogs.forEach((blog, index) => {
        systemPrompt += `${index + 1}. "${blog.title}" - ${blog.content.substring(0, 200)}...\n`;
      });
    }

    // Add review insights if available
    if (context.reviews && context.reviews.length > 0) {
      const avgRating = (
        context.reviews.reduce((sum, r) => sum + r.rating, 0) / context.reviews.length
      ).toFixed(1);
      systemPrompt += `\n**Client Feedback:**\nAverage rating: ${avgRating}/5 from recent reviews.\n`;
      
      const positiveComments = context.reviews
        .filter((r) => r.comment)
        .slice(0, 3);
      
      if (positiveComments.length > 0) {
        systemPrompt += `Sample feedback:\n`;
        positiveComments.forEach((r) => {
          systemPrompt += `- "${r.comment.substring(0, 100)}..."\n`;
        });
      }
    }

    // Add custom instructions if provided
    if (assistantPlan.customInstructions) {
      systemPrompt += `\n**Additional Instructions:**\n${assistantPlan.customInstructions}\n`;
    }

    // Add assistant description if provided
    if (assistantPlan.assistantDescription) {
      systemPrompt += `\n**Your Personality:**\n${assistantPlan.assistantDescription}\n`;
    }

    return systemPrompt;
  }

  /**
   * Save chat message to database
   */
  async saveChatMessage(sessionId, userId, astrologerId, role, message, contextUsed = {}, tokensUsed = 0) {
    try {
      const chat = await AssistantChat.create({
        sessionId,
        userId,
        astrologerId,
        role,
        message,
        contextUsed,
        tokensUsed,
      });

      return chat;
    } catch (error) {
      console.error("Error saving chat message:", error);
      throw error;
    }
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionId, limit = 50) {
    try {
      const messages = await AssistantChat.findAll({
        where: { sessionId },
        order: [["createdAt", "ASC"]],
        limit,
        attributes: ["id", "role", "message", "createdAt"],
      });

      return messages.map((msg) => ({
        role: msg.role,
        content: msg.message,
      }));
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw error;
    }
  }

  /**
   * Check if daily chat limit is reached
   */
  async checkDailyLimit(astrologerId, assistantPlan) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const chatCount = await AssistantChat.count({
        where: {
          astrologerId,
          role: "user",
          createdAt: {
            [Op.gte]: today,
          },
        },
      });

      const maxChats = assistantPlan.features.maxChatsPerDay || 100;

      return {
        used: chatCount,
        limit: maxChats,
        remaining: Math.max(0, maxChats - chatCount),
        exceeded: chatCount >= maxChats,
      };
    } catch (error) {
      console.error("Error checking daily limit:", error);
      throw error;
    }
  }

  /**
   * Increment chat count for astrologer's assistant
   */
  async incrementChatCount(astrologerId) {
    try {
      await AssistantPlan.increment("totalChatsHandled", {
        where: { astrologerId },
      });

      await AssistantPlan.update(
        { lastActiveAt: new Date() },
        { where: { astrologerId } }
      );
    } catch (error) {
      console.error("Error incrementing chat count:", error);
    }
  }

  /**
   * Format conversation for AI API
   */
  formatConversationForAI(systemPrompt, chatHistory) {
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...chatHistory,
    ];

    return messages;
  }
}

module.exports = new AssistantService();
