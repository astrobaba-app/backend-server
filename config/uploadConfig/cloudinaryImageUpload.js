const multer = require("multer");
const path = require("path");
const { Readable } = require("stream");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const allowedExt = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
  const allowedMime = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
    "application/octet-stream",
  ];

  // iOS camera/gallery HEIC uploads may come with non-standard MIME types.
  // Accept if either extension or MIME indicates a valid image format.
  if (allowedExt.includes(extension) || allowedMime.includes(file.mimetype)) {
    callback(null, true);
    return;
  }

  callback(new Error("Only JPG, JPEG, PNG, WEBP, HEIC, and HEIF images are allowed"));
};

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: imageFileFilter,
});

const uploadImageToCloudinary = (file, options = {}) => {
  const folder = options.folder || "graho/palm-uploads";

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    Readable.from(file.buffer).pipe(uploadStream);
  });
};

const palmImagesUpload = [
  (req, res, next) => {
    upload.array("palmImages", 4)(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const message = error.code === "LIMIT_FILE_SIZE" ? "Each image must be 8MB or less" : error.message;
      res.status(400).json({ success: false, message });
    });
  },
  async (req, res, next) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        req.uploadedPalmImages = [];
        return next();
      }

      // Cost optimization: process only the first image by default.
      const primaryFile = files[0];
      const hash = crypto.createHash("sha256").update(primaryFile.buffer).digest("hex");
      const result = await uploadImageToCloudinary(primaryFile);
      const optimizedUrl = cloudinary.url(result.public_id, {
        secure: true,
        resource_type: "image",
        width: 1024,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
      });

      req.uploadedPalmImages = [{
        url: optimizedUrl,
        originalUrl: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        hash,
      }];
      req.ignoredPalmImagesCount = Math.max(0, files.length - 1);
      next();
    } catch (error) {
      next(error);
    }
  },
];

module.exports = { palmImagesUpload };
