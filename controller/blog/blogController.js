const Blog = require("../../model/blog/blog");
const Astrologer = require("../../model/astrologer/astrologer");

// Create blog (astrologer only)
const createBlog = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    // Get image URL from uploaded file (if any)
    const image = req.fileUrl || null;

    const blog = await Blog.create({
      astrologerId,
      title,
      description,
      image,
    });

    // Get astrologer details
    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: ["id", "fullName", "photo", "email"],
    });

    res.status(201).json({
      success: true,
      message: "Blog created successfully",
      blog: {
        id: blog.id,
        title: blog.title,
        description: blog.description,
        image: blog.image,
        isPublished: blog.isPublished,
        views: blog.views,
        likes: blog.likes,
        createdAt: blog.createdAt,
        astrologer,
      },
    });
  } catch (error) {
    console.error("Create blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create blog",
      error: error.message,
    });
  }
};

// Get all blogs (public - all users can view)
const getAllBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, astrologerId } = req.query;
    const offset = (page - 1) * limit;

    const where = { isPublished: true };
    if (astrologerId) {
      where.astrologerId = astrologerId;
    }

    const { rows: blogs, count } = await Blog.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "email", "rating", "yearsOfExperience"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all blogs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blogs",
      error: error.message,
    });
  }
};

// Get single blog by ID (public)
const getBlogById = async (req, res) => {
  try {
    const { blogId } = req.params;

    const blog = await Blog.findByPk(blogId, {
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "email", "rating", "yearsOfExperience", "bio"],
        },
      ],
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Increment views
    await blog.increment("views");

    res.status(200).json({
      success: true,
      blog: {
        ...blog.toJSON(),
        views: blog.views + 1,
      },
    });
  } catch (error) {
    console.error("Get blog by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
};

// Get blogs by logged-in astrologer (astrologer only)
const getMyBlogs = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: blogs, count } = await Blog.findAndCountAll({
      where: { astrologerId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get my blogs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your blogs",
      error: error.message,
    });
  }
};

// Update blog (astrologer only - own blogs)
const updateBlog = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { blogId } = req.params;
    const { title, description, isPublished } = req.body;

    const blog = await Blog.findOne({
      where: { id: blogId, astrologerId },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found or you don't have permission to update it",
      });
    }

    // Update fields
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (req.fileUrl) updateData.image = req.fileUrl;
    if (isPublished !== undefined) updateData.isPublished = isPublished;

    await blog.update(updateData);

    res.status(200).json({
      success: true,
      message: "Blog updated successfully",
      blog,
    });
  } catch (error) {
    console.error("Update blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update blog",
      error: error.message,
    });
  }
};

// Delete blog (astrologer only - own blogs)
const deleteBlog = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { blogId } = req.params;

    const blog = await Blog.findOne({
      where: { id: blogId, astrologerId },
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found or you don't have permission to delete it",
      });
    }

    await blog.destroy();

    res.status(200).json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error("Delete blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete blog",
      error: error.message,
    });
  }
};

// Like blog (public)
const likeBlog = async (req, res) => {
  try {
    const { blogId } = req.params;

    const blog = await Blog.findByPk(blogId);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    await blog.increment("likes");

    res.status(200).json({
      success: true,
      message: "Blog liked successfully",
      likes: blog.likes + 1,
    });
  } catch (error) {
    console.error("Like blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to like blog",
      error: error.message,
    });
  }
};

module.exports = {
  createBlog,
  getAllBlogs,
  getBlogById,
  getMyBlogs,
  updateBlog,
  deleteBlog,
  likeBlog,
};
