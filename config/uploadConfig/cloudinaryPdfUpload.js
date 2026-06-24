require("dotenv").config();
const multer = require("multer");
const path = require("path");
const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;
const supabase = require("../../supabaseConfig/supabase");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 600000, // 10 minutes timeout
});

const DEFAULT_PDF_FOLDER = "graho/job-resumes";
const DEFAULT_KUNDLI_REPORT_FOLDER = "graho/kundli-reports";

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

const sanitizePdfFileName = (fileName) => {
  const sanitized = String(fileName || "document")
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return `${sanitized || "document"}.pdf`;
};

const uploadToCloudinary = (file, options = {}) => {
  const { folder = DEFAULT_PDF_FOLDER, resource_type = "image" } = options;

  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      reject(new Error("Cloudinary configuration is missing"));
      return;
    }

    // Use chunked upload for files larger than 10MB to prevent timeouts
    const isLarge = file.buffer && file.buffer.length > 10 * 1024 * 1024;
    const uploadMethod = isLarge
      ? cloudinary.uploader.upload_chunked_stream
      : cloudinary.uploader.upload_stream;

    const uploadOptions = {
      folder,
      resource_type: isLarge ? "raw" : resource_type,
      use_filename: true,
      unique_filename: true,
      timeout: 600000, // 10 minutes timeout for uploads
    };

    if (isLarge) {
      uploadOptions.chunk_size = 6 * 1024 * 1024; // 6MB chunks
    }

    const uploadStream = uploadMethod(
      uploadOptions,
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

const uploadPdfBuffer = async ({ buffer, fileName, folder = DEFAULT_KUNDLI_REPORT_FOLDER }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Invalid PDF buffer for Cloudinary upload");
  }

  const normalizedName = sanitizePdfFileName(fileName || `kundli_report_${Date.now()}.pdf`);

  // Fallback to Supabase Storage for large files (> 10MB) to bypass Cloudinary's strict 10MB limit
  if (buffer.length > 10 * 1024 * 1024) {
    console.log(`[Upload Service] File size (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds Cloudinary 10MB limit. Using Supabase Storage fallback...`);
    const bucket = process.env.SUPABASE_BUCKET || "astrobaba";
    const filePath = `reports/${Date.now()}_${normalizedName}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error("[Upload Service] Supabase upload failed:", error);
      throw error;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    console.log("[Upload Service] Supabase upload completed successfully:", data.publicUrl);

    return {
      secure_url: data.publicUrl,
      public_id: filePath,
    };
  }

  // Standard Cloudinary upload for smaller files
  return uploadToCloudinary(
    {
      originalname: normalizedName,
      mimetype: "application/pdf",
      buffer,
    },
    { folder, resource_type: "image" }
  );
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
  uploadPdfBuffer,
};
