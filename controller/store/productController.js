const Product = require("../../model/store/product");
const Cart = require("../../model/store/cart");
const User = require("../../model/user/userAuth");
const { sequelize } = require("../../dbConnection/dbConfig");
const { Op } = require("sequelize");

// Helper function to generate slug
const generateSlug = (productName) => {
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

// ==================== ADMIN: Product Management ====================

// Create product
exports.createProduct = async (req, res) => {
  try {
    const {
      productName,
      description,
      shortDescription,
      price,
      discountPrice,
      images,
      category,
      productType,
      digitalFileUrl,
      downloadLinkExpiry,
      stock,
      weight,
      dimensions,
      tags,
      isFeatured,
      seoTitle,
      seoDescription,
      seoKeywords,
    } = req.body;

    // Validate required fields
    if (!productName || !description || !price || !category || !productType) {
      return res.status(400).json({
        success: false,
        message:
          "Product name, description, price, category, and product type are required",
      });
    }

    // Generate unique slug
    let slug = generateSlug(productName);
    const existingSlug = await Product.findOne({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    // Validate digital product has file URL
    if (productType === "digital" && !digitalFileUrl) {
      return res.status(400).json({
        success: false,
        message: "Digital products must have a digital file URL",
      });
    }

    // Create product
    const product = await Product.create({
      productName,
      slug,
      description,
      shortDescription,
      price,
      discountPrice,
      images: images || [],
      category,
      productType,
      digitalFileUrl,
      downloadLinkExpiry: downloadLinkExpiry || 30,
      stock: productType === "digital" ? 999999 : stock || 0, // Digital products have unlimited stock
      weight,
      dimensions,
      tags: tags || [],
      isFeatured: isFeatured || false,
      seoTitle,
      seoDescription,
      seoKeywords: seoKeywords || [],
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create product",
      error: error.message,
    });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updateData = req.body;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Update slug if productName changed
    if (updateData.productName && updateData.productName !== product.productName) {
      let newSlug = generateSlug(updateData.productName);
      const existingSlug = await Product.findOne({
        where: { slug: newSlug },
      });
      if (existingSlug && existingSlug.id !== productId) {
        newSlug = `${newSlug}-${Date.now()}`;
      }
      updateData.slug = newSlug;
    }

    await product.update(updateData);

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await product.destroy();

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

// Toggle product active status
exports.toggleProductStatus = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await product.update({ isActive: !product.isActive });

    return res.status(200).json({
      success: true,
      message: `Product ${product.isActive ? "activated" : "deactivated"} successfully`,
      product,
    });
  } catch (error) {
    console.error("Error toggling product status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle product status",
      error: error.message,
    });
  }
};

// ==================== PUBLIC: Browse Products ====================

// Get all products (public + admin)
exports.getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      productType,
      minPrice,
      maxPrice,
      isFeatured,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Only show active products to non-admin users
    if (!req.admin) {
      where.isActive = true;
    }

    if (category) where.category = category;
    if (productType) where.productType = productType;
    if (isFeatured !== undefined) where.isFeatured = isFeatured === "true";

    // Price range filter
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = minPrice;
      if (maxPrice) where.price[Op.lte] = maxPrice;
    }

    // Search filter
    if (search) {
      where[Op.or] = [
        { productName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { shortDescription: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]],
    });

    return res.status(200).json({
      success: true,
      products,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
};

// Get single product
exports.getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByPk(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if product is active (for non-admin users)
    if (!req.admin && !product.isActive) {
      return res.status(404).json({
        success: false,
        message: "Product not available",
      });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product",
      error: error.message,
    });
  }
};

// Get product by slug
exports.getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await Product.findOne({ where: { slug } });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!product.isActive) {
      return res.status(404).json({
        success: false,
        message: "Product not available",
      });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product",
      error: error.message,
    });
  }
};

// Get featured products
exports.getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const products = await Product.findAll({
      where: { isFeatured: true, isActive: true },
      limit: parseInt(limit),
      order: [["averageRating", "DESC"], ["soldCount", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch featured products",
      error: error.message,
    });
  }
};

// Get categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Product.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "productCount"],
      ],
      where: { isActive: true },
      group: ["category"],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: error.message,
    });
  }
};
