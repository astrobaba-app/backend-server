require("dotenv").config();
const multer = require("multer");
const path = require("path");
const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const isPdfMime = file.mimetype === "application/pdf";
  const isPdfExt = extension === ".pdf";

  if (isPdfMime && isPdfExt) {
    callback(null, true);
    return;
  }

  callback(new Error("Only PDF files are allowed"));
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter,
});

const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      reject(new Error("Cloudinary configuration is missing"));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "graho/job-resumes",
        resource_type: "raw",
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

const singlePdfUpload = (fieldName) => [
  (req, res, next) => {
    upload.single(fieldName)(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Resume size must be 5MB or less"
          : error.message || "Invalid resume upload";

      res.status(400).json({
        success: false,
        message,
      });
    });
  },
  async (req, res, next) => {
    try {
      if (req.file) {
        const result = await uploadToCloudinary(req.file);
        req.fileUrl = result.secure_url;
        req.filePublicId = result.public_id;
      }

      next();
    } catch (error) {
      next(error);
    }
  },
];

module.exports = {
  single: singlePdfUpload,
};
