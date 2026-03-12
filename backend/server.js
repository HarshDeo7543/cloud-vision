require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy (needed when behind Nginx/load balancer on EC2)
app.set('trust proxy', 1);

// Configure CORS
app.use(cors());
app.use(express.json());

// Global rate limiter: generous limit to protect EC2 from abuse
// 200 requests per 15 min per IP — high enough that a full classroom on one Wi-Fi won't hit it
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ─── In-handler rate limiter (runs after multer, so req.body is guaranteed) ───
const uploadRateLimits = new Map(); // key -> { count, windowStart }

function checkUploadRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const entry = uploadRateLimits.get(key);

  if (!entry || (now - entry.windowStart) > windowMs) {
    // New window
    uploadRateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}

// Clean up expired entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of uploadRateLimits) {
    if ((now - entry.windowStart) > 10 * 60 * 1000) {
      uploadRateLimits.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, JPG and PNG images are allowed.'), false);
    }
  },
});

// Default S3 Client (uses server's .env credentials)
const defaultS3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const DEFAULT_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rekog-input-bucket-xyz';

// ─── MongoDB connection ───
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// Audit log schema
const auditSchema = new mongoose.Schema({
  originalFilename: String,
  imageUrl: String,
  cloudinaryPublicId: String,
  bucketName: String,
  s3Key: String,
  analysisMode: { type: String, enum: ['face', 'moderation'] },
  credentialType: { type: String, enum: ['custom', 'default'] },
  accessKeyPrefix: String,
  iamUsername: String,
  region: String,
  ip: String,
  fileSize: Number,
  mimeType: String,
}, { timestamps: true });

const AuditLog = mongoose.model('AuditLog', auditSchema);

// Request counter schema
const counterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  count: { type: Number, default: 0 },
});
const Counter = mongoose.model('Counter', counterSchema);

// Middleware: count every request
app.use(async (req, res, next) => {
  try {
    await Counter.findOneAndUpdate(
      { name: 'totalRequests' },
      { $inc: { count: 1 } },
      { upsert: true }
    );
  } catch (_) { /* non-blocking */ }
  next();
});

// ─── Cloudinary configuration ───
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload image buffer to Cloudinary
function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const publicId = `cloud-vision-audit/${Date.now()}_${safeName}`;
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'cloud-vision-audit', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// Create S3 client with custom credentials
function createCustomS3Client(credentials) {
  return new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
}

// Get IAM username from credentials via STS
async function getIAMUsername(accessKeyId, secretAccessKey, region) {
  try {
    const stsClient = new STSClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    stsClient.destroy();
    // ARN format: arn:aws:iam::123456789012:user/username
    const arn = identity.Arn || '';
    const parts = arn.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : arn;
  } catch (err) {
    console.error('[Audit] Failed to get IAM username:', err.message);
    return null;
  }
}

// Helper function to check if result file exists
async function checkResultExists(s3Client, bucketName, resultKey) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: resultKey,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

// Helper function to get result file content
async function getResultContent(s3Client, bucketName, resultKey) {
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: bucketName,
    Key: resultKey,
  }));
  
  const bodyContents = await streamToString(response.Body);
  return JSON.parse(bodyContents);
}

// Helper function to convert stream to string
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// Poll for result with timeout
async function pollForResult(s3Client, bucketName, resultKey, maxAttempts = 15, intervalMs = 1000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const exists = await checkResultExists(s3Client, bucketName, resultKey);
    if (exists) {
      return await getResultContent(s3Client, bucketName, resultKey);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout: Result file not found within the expected time.');
}

const ADMIN_PIN = process.env.ADMIN_PIN;

// Upload endpoint — multer runs first, then rate limit is checked inside the handler.
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    // Get analysis mode (default to 'face')
    const analysisMode = req.body.analysisMode || 'face';
    if (!['face', 'moderation'].includes(analysisMode)) {
      return res.status(400).json({ error: 'Invalid analysis mode. Use "face" or "moderation".' });
    }

    // ── Rate limit check (after multer, so req.body is 100% available) ──
    const isCustom = req.body.useCustomCredentials === 'true';
    let rateKey, rateMax, rateWindow, rateMsg;

    if (isCustom) {
      // Per-student limit keyed by their accessKeyId (not IP — shared Wi-Fi safe)
      rateKey = `custom_${req.body.accessKeyId || req.ip}`;
      rateMax = 10;   // 10 uploads per 5 min per credential set
      rateWindow = 5 * 60 * 1000;
      rateMsg = 'Upload limit reached for your credentials. Please wait a few minutes.';
    } else {
      // Strict limit for default (admin) credentials keyed by IP
      rateKey = `default_${req.ip}`;
      rateMax = 5;    // 5 uploads per 10 min per IP
      rateWindow = 10 * 60 * 1000;
      rateMsg = 'Too many uploads using default credentials. Please wait or use your own AWS credentials.';
    }

    const rateCheck = checkUploadRateLimit(rateKey, rateMax, rateWindow);
    console.log(`[Rate Limit] key=${rateKey} allowed=${rateCheck.allowed} remaining=${rateCheck.remaining}`);

    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: rateMsg,
        retryAfterSeconds: rateCheck.retryAfterSec,
      });
    }

    // ── Credential setup ──
    // Check if custom credentials are provided
    let s3Client = defaultS3Client;
    let bucketName = DEFAULT_BUCKET_NAME;
    let usingCustomCredentials = false;

    // Parse custom credentials from form data if provided
    if (isCustom) {
      const { accessKeyId, secretAccessKey, region, bucketName: customBucket } = req.body;
      
      if (!accessKeyId || !secretAccessKey || !region || !customBucket) {
        return res.status(400).json({ 
          error: 'Custom credentials mode requires: accessKeyId, secretAccessKey, region, and bucketName' 
        });
      }

      s3Client = createCustomS3Client({
        accessKeyId,
        secretAccessKey,
        region,
      });
      bucketName = customBucket;
      usingCustomCredentials = true;
      console.log(`Using custom credentials for bucket: ${bucketName} in region: ${region}`);
    } else {
      // Using default credentials - require admin PIN
      const { adminPin } = req.body;
      if (!adminPin || adminPin !== ADMIN_PIN) {
        return res.status(401).json({ 
          error: 'Admin PIN required to use default AWS credentials.',
          requiresPin: true
        });
      }
      console.log('Using default credentials with valid admin PIN');
    }

    const originalName = req.file.originalname;
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
    
    // Determine folder and result key based on analysis mode
    let s3Key, resultKey;
    if (analysisMode === 'face') {
      s3Key = `face_analysis/${originalName}`;
      resultKey = `face_analysis/${nameWithoutExt}.result.json`;
    } else {
      s3Key = `moderation/${originalName}`;
      resultKey = `moderation/${nameWithoutExt}.moderation.json`;
    }

    console.log(`Analysis mode: ${analysisMode}`);
    console.log(`Uploading file to: ${s3Key}`);
    console.log(`Expecting result at: ${resultKey}`);

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    console.log('File uploaded successfully. Waiting for Rekognition results...');

    // ── Audit: upload image to Cloudinary and log to MongoDB ──
    let imageUrl = null;
    let cloudinaryPublicId = null;
    try {
      const cloudResult = await uploadToCloudinary(req.file.buffer, originalName);
      imageUrl = cloudResult.secure_url;
      cloudinaryPublicId = cloudResult.public_id;
      console.log(`[Audit] Image uploaded to Cloudinary: ${imageUrl}`);
    } catch (cloudErr) {
      console.error('[Audit] Cloudinary upload failed:', cloudErr.message);
    }

    // Resolve IAM username (non-blocking for the main flow)
    let iamUsername = null;
    if (usingCustomCredentials) {
      iamUsername = await getIAMUsername(
        req.body.accessKeyId,
        req.body.secretAccessKey,
        req.body.region
      );
      if (iamUsername) console.log(`[Audit] IAM User: ${iamUsername}`);
    }

    try {
      await AuditLog.create({
        originalFilename: originalName,
        imageUrl,
        cloudinaryPublicId,
        bucketName,
        s3Key,
        analysisMode,
        credentialType: usingCustomCredentials ? 'custom' : 'default',
        accessKeyPrefix: usingCustomCredentials ? req.body.accessKeyId.slice(0, 6) + '...' : 'default',
        iamUsername: iamUsername || (usingCustomCredentials ? null : 'admin (default)'),
        region: usingCustomCredentials ? req.body.region : (process.env.AWS_REGION || 'ap-south-1'),
        ip: req.ip,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
      console.log(`[Audit] Logged to MongoDB -> bucket: ${bucketName}`);
    } catch (dbErr) {
      console.error('[Audit] MongoDB log failed:', dbErr.message);
    }

    // Poll for result based on analysis mode
    const result = await pollForResult(s3Client, bucketName, resultKey);
    console.log(`${analysisMode === 'face' ? 'Face detection' : 'Content moderation'} result received.`);

    // Destroy custom client if created
    if (usingCustomCredentials) {
      s3Client.destroy();
    }

    // Return response based on analysis mode
    if (analysisMode === 'face') {
      res.json({
        success: true,
        filename: originalName,
        analysisMode: 'face',
        result: result,
        moderation: null,
      });
    } else {
      res.json({
        success: true,
        filename: originalName,
        analysisMode: 'moderation',
        result: null,
        moderation: result,
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('Timeout')) {
      return res.status(504).json({ error: error.message });
    }
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.name === 'CredentialsProviderError' || error.message.includes('credential')) {
      return res.status(401).json({ error: 'Invalid AWS credentials provided.' });
    }

    if (error.name === 'NoSuchBucket') {
      return res.status(400).json({ error: 'The specified S3 bucket does not exist.' });
    }

    if (error.name === 'AccessDenied') {
      return res.status(403).json({ error: 'Access denied. Check your AWS credentials and bucket permissions.' });
    }

    res.status(500).json({ error: 'An error occurred while processing the image.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── Audit log endpoint (admin-only) ───
app.get('/audit', async (req, res) => {
  const { pin } = req.query;
  if (!pin || pin !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Admin PIN required.' });
  }
  try {
    const entries = await AuditLog.find().sort({ createdAt: -1 }).lean();
    const requestCounter = await Counter.findOne({ name: 'totalRequests' }).lean();
    const stats = {
      totalUploads: entries.length,
      totalRequests: requestCounter?.count || 0,
      uniqueBuckets: [...new Set(entries.map(e => e.bucketName))],
      uniqueIPs: [...new Set(entries.map(e => e.ip))].length,
      uniqueIAMUsers: [...new Set(entries.filter(e => e.iamUsername).map(e => e.iamUsername))],
      byMode: {
        face: entries.filter(e => e.analysisMode === 'face').length,
        moderation: entries.filter(e => e.analysisMode === 'moderation').length,
      },
      byCredentialType: {
        custom: entries.filter(e => e.credentialType === 'custom').length,
        default: entries.filter(e => e.credentialType === 'default').length,
      },
    };
    res.json({ stats, entries });
  } catch (err) {
    console.error('[Audit] Failed to fetch audit log:', err.message);
    res.status(500).json({ error: 'Failed to read audit log.' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds the 10MB limit.' });
    }
    return res.status(400).json({ error: error.message });
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({ error: error.message });
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
