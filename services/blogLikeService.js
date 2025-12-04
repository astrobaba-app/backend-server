const BlogLike = require("../model/blog/blogLike");

/**
 * Check if user/IP has liked a blog
 */
const checkIfLiked = async (blogId, userId, ipAddress) => {
  const existingLike = await BlogLike.findOne({
    where: {
      blogId,
      ...(userId ? { userId } : { ipAddress }),
    },
  });
  
  return !!existingLike;
};

/**
 * Add hasLiked status to blog object
 */
const addLikeStatus = async (blog, userId, ipAddress) => {
  const hasLiked = await checkIfLiked(blog.id, userId, ipAddress);
  
  return {
    ...blog.toJSON(),
    hasLiked,
  };
};

/**
 * Add hasLiked status to multiple blogs
 */
const addLikeStatusToBlogs = async (blogs, userId, ipAddress) => {
  return await Promise.all(
    blogs.map(async (blog) => {
      const hasLiked = await checkIfLiked(blog.id, userId, ipAddress);
      return {
        ...blog.toJSON(),
        hasLiked,
      };
    })
  );
};

module.exports = {
  checkIfLiked,
  addLikeStatus,
  addLikeStatusToBlogs,
};
