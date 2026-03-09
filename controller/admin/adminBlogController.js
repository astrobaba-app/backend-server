const Blog = require("../../model/blog/blog");
const Admin = require("../../model/admin/admin");
const Astrologer = require("../../model/astrologer/astrologer");

// Create a new blog (admin only)
const createAdminBlog = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { title, description, category, isPublished } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    // Handle multiple images from req.fileUrls (array upload)
    const imageUrls = req.fileUrls && req.fileUrls.length > 0 ? req.fileUrls : [];
    const primaryImage = imageUrls.length > 0 ? imageUrls[0] : (req.fileUrl || null);

    const blog = await Blog.create({
      adminId,
      title,
      description,
      category: category || null,
      image: primaryImage,
      images: imageUrls.length > 0 ? imageUrls : null,
      isPublished: isPublished === "false" || isPublished === false ? false : true,
    });

    const admin = await Admin.findByPk(adminId, {
      attributes: ["id", "name", "email"],
    });

    res.status(201).json({
      success: true,
      message: "Blog created successfully",
      blog: {
        ...blog.toJSON(),
        admin,
      },
    });
  } catch (error) {
    console.error("Create admin blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create blog",
      error: error.message,
    });
  }
};

// Get all blogs for admin management (includes unpublished)
const getAllAdminBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, isPublished } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (isPublished !== undefined && isPublished !== "") {
      where.isPublished = isPublished === "true";
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
          attributes: ["id", "fullName", "photo", "email"],
          required: false,
        },
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "name", "email"],
          required: false,
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
    console.error("Get all admin blogs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blogs",
      error: error.message,
    });
  }
};

// Update any blog (admin only)
const updateAdminBlog = async (req, res) => {
  try {
    const { blogId } = req.params;
    const { title, description, category, isPublished } = req.body;

    const blog = await Blog.findByPk(blogId);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category || null;
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished === "true" || isPublished === true;
    }

    // Handle new image uploads
    if (req.fileUrls && req.fileUrls.length > 0) {
      updateData.images = req.fileUrls;
      updateData.image = req.fileUrls[0];
    } else if (req.fileUrl) {
      updateData.image = req.fileUrl;
    }

    await blog.update(updateData);
    await blog.reload();

    res.status(200).json({
      success: true,
      message: "Blog updated successfully",
      blog,
    });
  } catch (error) {
    console.error("Update admin blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update blog",
      error: error.message,
    });
  }
};

// Delete any blog (admin only)
const deleteAdminBlog = async (req, res) => {
  try {
    const { blogId } = req.params;

    const blog = await Blog.findByPk(blogId);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    await blog.destroy();

    res.status(200).json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error("Delete admin blog error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete blog",
      error: error.message,
    });
  }
};

// Toggle blog publish status
const toggleBlogPublish = async (req, res) => {
  try {
    const { blogId } = req.params;

    const blog = await Blog.findByPk(blogId);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    const newStatus = !blog.isPublished;
    await blog.update({ isPublished: newStatus });

    res.status(200).json({
      success: true,
      message: `Blog ${newStatus ? "published" : "unpublished"} successfully`,
      blog,
    });
  } catch (error) {
    console.error("Toggle blog publish error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle blog publish status",
      error: error.message,
    });
  }
};

// Upload a single inline image (for use inside blog content blocks)
const uploadInlineImage = async (req, res) => {
  try {
    const imageUrl = req.fileUrl;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }
    res.status(200).json({ success: true, url: imageUrl });
  } catch (error) {
    console.error("Upload inline image error:", error);
    res.status(500).json({ success: false, message: "Failed to upload image", error: error.message });
  }
};

module.exports = {
  createAdminBlog,
  getAllAdminBlogs,
  updateAdminBlog,
  deleteAdminBlog,
  toggleBlogPublish,
  uploadInlineImage,
};
