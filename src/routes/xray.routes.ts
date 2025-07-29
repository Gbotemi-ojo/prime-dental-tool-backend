// src/routes/xray.routes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticateToken } from '../middleware/auth';

// --- Configure Cloudinary ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- Configure Multer for in-memory storage ---
const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = Router();

/**
 * @route   POST /api/xray/upload
 * @desc    Uploads an X-ray image to Cloudinary
 * @access  Private (Requires authentication)
 */
router.post('/upload', authenticateToken, upload.single('xray'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Please provide a file with the key "xray".' });
    return;
  }

  try {
    // --- Promisify the Cloudinary upload stream ---
    const uploadFromBuffer = (buffer: Buffer): Promise<any> => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'xrays' }, // Optional: organizes uploads into a specific folder
          (error, result) => {
            if (error) {
              return reject(error);
            }
            resolve(result);
          }
        );
        stream.end(buffer);
      });
    };

    const result = await uploadFromBuffer(req.file.buffer);

    // --- Send back the secure URL and public ID ---
    res.status(201).json({
      message: 'Image uploaded successfully',
      xrayUrl: result.secure_url,
      publicId: result.public_id,
    });

  } catch (error: any) {
    console.error('Cloudinary Upload Error:', error);
    res.status(500).json({ error: 'Image upload failed.', details: error.message });
  }
});

export default router;
